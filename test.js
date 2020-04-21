const mongoose = require('mongoose')
const {Game,addPlayerToGame,drawCardToPlayer,checkWinCondition,distributeInitialCard,playCard,passTurn} = require('./model')

beforeAll(()=>{
    mongoose.connect('mongodb://localhost/UnoTest')
})

afterEach(async ()=>{await Game.remove({})})

test('Creating a game',async ()=>{
    const game = new Game
    expect(game.players.length).toBe(0)
    expect(game.deck).toContain('Wild')
    await game.save()
})

test('Adding player to game',async ()=>{
    const game = new Game
    await game.save()
    const id = await addPlayerToGame(game,'long')
    expect(typeof id).toBe('number')
    expect(game.players[id]).toBeTruthy()
    expect(game.players[id].cards.length).toBe(0)
})

test("Drawing a card",async ()=>{
    const game = new Game
    await game.save()
    const deckLength = game.deck.length
    const id = await addPlayerToGame(game,'long')
    const card = await drawCardToPlayer(game,id)
    expect(game.deck.length).toBe(deckLength-1)
    expect(card).toBeTruthy()
    expect(game.players[id].cards.length).toBe(1)
    expect(game.players[id].cards).toContain(card)
})

test("Checking the win condition",async ()=>{
    const game = new Game
    await game.save()
    const id = await addPlayerToGame(game,'long')
    const win = await checkWinCondition(game)
    expect(win).toBe(0)
    await drawCardToPlayer(game,0)
    const win2 = await checkWinCondition(game)
    expect(win2).toBeFalsy()
})

test("Distributing Intial Card",async ()=>{
    const game = new Game
    await game.save()
    const id = await addPlayerToGame(game,'long')
    const id2 = await addPlayerToGame(game,'long')
    await distributeInitialCard(game)
    expect(game.players[0].cards.length).toBe(7)
    expect(game.players[1].cards.length).toBe(7)
})

test("Playing different cards",async ()=>{
    const game = new Game
    await game.save()
    const id = await addPlayerToGame(game,'long')
    const id2 = await addPlayerToGame(game,'long')
    game.players[0].cards = ['blue Draw 2','Draw 4','blue Reverse','blue Skip','blue 4']
    const oldDeckLength = game.deck.length
    const oldPlayerHandLength = game.players[0].cards.length
    await passTurn(game)
    await playCard(game,id,'blue Draw 2')
    expect(game.players[0].cards.length).toBe(oldPlayerHandLength-1)
    expect(game.players[id2].cards.length).toBe(2)
    expect(game.onTurn).toBe(1)
    await playCard(game,id,'Draw 4')
    expect(game.players[0].cards.length).toBe(oldPlayerHandLength-2)
    expect(game.players[id2].cards.length).toBe(6)
    expect(game.onTurn).toBe(0)
    await playCard(game,id,'blue Reverse')
    expect(game.players[0].cards.length).toBe(oldPlayerHandLength-3)
    expect(game.turnCoefficient).toBe(-1)
    await playCard(game,id,'blue Skip')
    expect(game.players[0].cards.length).toBe(oldPlayerHandLength-4)
    console.log(game.onTurn)
    expect(game.onTurn).toBe(1)
    await playCard(game,id,'blue 4')
    expect(game.players[0].cards.length).toBe(oldPlayerHandLength-5)
    expect(game.currentTopCard).toBe('blue 4')
})

afterAll(()=>{
    mongoose.disconnect()
})