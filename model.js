const mongoose = require('mongoose')
const _ = require('lodash')
const playerSchema = new mongoose.Schema({
    username:{
        type:String,
        required:true,
    },
    cards:{
        type:[String],
        default:[]
    },
    bot:{
        type:Boolean,
        default:false
    },
    active:{
        type:Boolean,
        default:true
    }
})

const Player = mongoose.model('players',playerSchema)


const specialAction = ['Draw 2','Draw 2','Skip','Skip','Reverse','Reverse']
const createColorDeck = color=>[...Array(18).fill(color).map((e,i)=>`${e} ${(i+1>9)?i-8:i+1}`),...Array(6).fill('').map((e,i)=>`${color} ${specialAction[i]}`)]

const gameSchema = new mongoose.Schema({
    inGame:{
        type:Boolean,default:false
    },
    players:{
        type:[playerSchema],default:[]
    },
    deck:{
        type:[String],default:[
            ...createColorDeck('green'),
            ...createColorDeck('blue'),
            ...createColorDeck('red'),
            ...createColorDeck('yellow'),
            ...Array(4).fill("Wild"),
            ...Array(4).fill("Draw 4")
        ]
    },
    onTurn:{
        type:Number,default:-1
    },
    currentTopCard:{
        type:String,default:''
    },
    turnCoefficient:{
        type:Number,default:1
    },
    feed:{
        type:[String],default:[]
    },
    directives:{
        type:[[Number]],default:[]
    }
})
const ttl = require('mongoose-ttl')
gameSchema.plugin(ttl,{ttl:'2d'})

const Game = mongoose.model('games',gameSchema)

const findOneThenRemove = (arr)=>(arr.splice(_.random(arr.length-1),1)[0])
const gameFunctionFactory = func=>async(game,...args)=>{
    return func(game,...args)
}

const addPlayerToGame = gameFunctionFactory(async (game,username)=>{
    const player = new Player({username})
    const id = game.players.length
    game.players.push(player)
    game.feed.push(`${username} joined the game.`)
    await game.save()
    return id
})

const addBot = gameFunctionFactory(async (game,username)=>{
    const player = new Player({username,bot:true})
    const id = game.players.length
    game.players.push(player)
    game.feed.push(`${username} joined the game.`)
    await game.save()
    return id
})

const drawCardToPlayer = gameFunctionFactory(async (game,playerid)=>{
    const card = findOneThenRemove(game.deck)
    game.players[playerid].cards.push(card)
    game.feed.push(`${game.players[playerid].username} draw a card.`)
    game.directives.push([1,playerid])
    await game.save()
    return card
})

const checkWinCondition = gameFunctionFactory(async (game)=>{
    for(let playerid= 0;playerid<game.players.length; playerid++){
        if(game.players[playerid].cards.length === 0) return playerid
        else if(game.players[playerid].cards.length === 1){
            game.feed.push(`${game.players[playerid].username} only have 1 card left!`)
            game.directives.push([5,playerid])
            await game.save()
        }
    }
    return false
})

const distributeInitialCard = gameFunctionFactory(async (game)=>{
    game.players.forEach(player=>{
        for(let i = 0;i<7;i++) (player.cards.push(findOneThenRemove(game.deck)))
    })
    game.directives.push([7])
    await game.save()
})

const handleDraw = async (game,playerid,card)=>{
    await passTurn(game)
    let next = playerid + game.turnCoefficient
    if(next === game.players.length) next = 0
    else if(next < 0) next = game.players.length-1
    for(let i = 0;i<card;i++){
        game.players[next].cards.push(findOneThenRemove(game.deck))
    }
    if(card === 4) game.directives.push([2,next])
    else game.directives.push([3,next])
}

const playCard = gameFunctionFactory(async (game,playerid,card,extraColor)=>{
    game.feed.push(`${game.players[playerid].username} played a card.`)
    game.directives.push([4,playerid])
    game.players[playerid].cards.splice(game.players[playerid].cards.indexOf(card),1)
    game.deck.push(card)
    game.currentTopCard = ((card==='Draw 4'||card==='Wild')?extraColor+' ':'') + card
    if(card === 'Draw 4') await handleDraw(game,playerid,4)
    else{
        const action = card.split(' ').slice(1).join(' ')
        switch(action){
            case 'Reverse':
                game.turnCoefficient = -game.turnCoefficient
                break;
            case 'Skip':
                await passTurn(game)
                break
            case 'Draw 2':
                await handleDraw(game,playerid,2)
                break;
            default:
                break;
        }
    }
    await game.save()
})

const passTurn = gameFunctionFactory(async (game)=>{
    game.onTurn+=game.turnCoefficient
    if(game.onTurn === game.players.length) game.onTurn=0
    else if(game.onTurn < 0) game.onTurn = game.players.length-1
    await game.save()
})

const restartGame = gameFunctionFactory(async (game)=>{
    const id = game._id
    await Game.findByIdAndDelete(id)
    const newGame = new Game
    console.log(game)
    newGame.players = game.players.map(e=>new Player({username:e.username,bot:e.bot}))
    newGame._id = id
    const firstCard = newGame.deck.splice(_.random(newGame.deck.length-1),1)[0]
    newGame.currentTopCard = firstCard
    await newGame.save()
    return newGame
})

module.exports = {
    Game,addPlayerToGame,drawCardToPlayer,checkWinCondition,distributeInitialCard,playCard,passTurn,restartGame,addBot
}