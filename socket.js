const jwt = require('jsonwebtoken')
const {Game,addPlayerToGame,passTurn,playCard,drawCardToPlayer,distributeInitialCard,checkWinCondition,restartGame,addBot} = require('./model')

module.exports = server=>{
    const io = require('socket.io')(server)
    const gameSpecificInfo = new Map()

    const verify = (card,topCard)=>{
        if(card === 'Wild' || card==='Draw 4' || topCard === 'Wild' || topCard === 'Draw 4') return true
        const color = topCard.split(' ')[0]
        const action = topCard.split(' ').slice(1).join(' ')
        const color2 = card.split(' ')[0]
        const action2 = card.split(' ').slice(1).join(' ')
        return ((color===color2) || (action===action2))
    }

    const botPlayCard = (deck,currentTopCard)=>{
        for(let card of deck){
            if(verify(card,currentTopCard)) return card
        }
        return false
    }

    const botChooseColor = (deck)=>{
        const colors = ['red','blue','green','yellow'].map(c=>({color:c,number:0}))
        for(let card of deck){
            if(card === 'Draw 4' || card === 'Wild') continue
            const color = card.split(' ')[0]
            const index = colors.findIndex(e=>e.color===color)
            if(index <0) continue;
            colors[index].number++
        }
        return colors.sort((a,b)=>b.number-a.number)[0].color
    }

    io.on('connect',async (socket)=>{
        const emitToAll = (message,data)=>io.to(socket.room).emit(message,data)

        const update = async ()=>{
            const game = await Game.findById(socket.room).select('-deck')
            emitToAll('Update',game)
        }

        const socketFunctionFactory = (message,func)=>socket.on(message,async (data)=>{
            socket.game = await Game.findById(socket.room)
            try{await func(data)}
            catch(e){
                console.log(e)
                socket.emit('Error',e.message)
            }
        })
        const turnFunctionFactory = (message,func)=>socketFunctionFactory(message,async (data)=>{
            if(socket.userid !== socket.game.onTurn) throw Error("Not your turn")
            if(!socket.game.inGame) throw Error("The game hasn't started yet")
            socket.game.players[socket.userid].active = true
            await socket.game.save()
            beginTurnTimer()
            await func(data)
            update()
        })
        const botPlay = async (id)=>{
            console.log(id)
            const myDeck = socket.game.players[id].cards
            let card = botPlayCard(myDeck,socket.game.currentTopCard)
            console.log(card)
            if(!card){
                card = await drawCardToPlayer(socket.game,id)
                if(!verify(card,socket.game.currentTopCard)) return
            }
            if(card.match(/Wild/) || card.match(/Draw 4/)) var color = botChooseColor(myDeck)
            await playCard(socket.game,id,card,color)
        }
        const awaitTime = ()=>new Promise(r=>setTimeout(r,1000))
        const socketPassTurn = async ()=>{
            await passTurn(socket.game)
            const win = await checkWinCondition(socket.game,socket.userid)
            if(Number.isInteger(win)){
                socket.game.inGame = false
                socket.game.endGame = true
                await socket.game.save()
                cancelTurnTimer()
                return emitToAll('End Game',win)
            }
            if(socket.game.players[socket.game.onTurn].bot){
                await update()
                await awaitTime()
                await botPlay(socket.game.onTurn)
                await socketPassTurn(socket.game)
            }
            beginTurnTimer() 
        }

        const token = socket.handshake.query.token
        const {userid,id} = jwt.verify(token,process.env.SECRET_KEY)
        if((!userid && userid!==0) || !id){
            throw Error("Game does not exist")
        }
        socket.room = id
        socket.userid = userid
        socket.game = await Game.findById(id)
        socket.join(socket.room)
        update()
        if(!gameSpecificInfo.has(socket.room)) gameSpecificInfo.set(socket.room,{})
        const setTurnSpecificInfo = (property,value)=>{
            const old = gameSpecificInfo.get(socket.room)
            old[property] = value
            gameSpecificInfo.set(socket.room,old)
        }
        const getTurnSpecificInfo = (property)=>gameSpecificInfo.get(socket.room)[property]

        const beginTurnTimer = ()=>{
            cancelTurnTimer()
            setTurnSpecificInfo('timer1',setTimeout(async ()=>{
                socket.game.feed.push('Turn will automatically pass in 15 seconds')
                await socket.game.save()
                update()
            },15000))
            setTurnSpecificInfo('timer2',setTimeout(async ()=>{
                await botPlay(socket.game.onTurn)
                socket.game.players[socket.userid].active = false
                if(!socket.game.players.every(e=>e.bot||e.active)){
                    await Game.findByIdAndDelete(socket.game._id)
                    emitToAll("Delete Inactive")
                    return
                }
                await socketPassTurn()
                update()
            },30000))
        }

        const cancelTurnTimer = ()=>{
            if(!getTurnSpecificInfo('timer1')) return
            clearInterval(getTurnSpecificInfo('timer1'))
            clearInterval(getTurnSpecificInfo('timer2'))
        }

        socketFunctionFactory('Start Game',async ()=>{
            if(socket.game.inGame) throw Error("The game had started")
            if(socket.game.players.length === 1) throw Error("Not enough players")
            socket.game.inGame = true
            await distributeInitialCard(socket.game)
            await socketPassTurn()
            update()
            beginTurnTimer()
        })

        turnFunctionFactory('Draw Card',async ()=>{
            await drawCardToPlayer(socket.game,socket.userid)
        })

        const awaitChooseColor = ()=>new Promise(r=>{
            console.log('Choosing COlor')
            setTurnSpecificInfo('choosingColor',true)
            setTurnSpecificInfo('choosingColorFunction',r)
            socket.emit('Choose Color')
        })

        turnFunctionFactory('Choose Color',async (color)=>{
            if(getTurnSpecificInfo('choosingColor')) getTurnSpecificInfo('choosingColorFunction')(color)
        })

        turnFunctionFactory('Play Card',async (card)=>{
            if(card === 'Wild' || card === 'Draw 4') var extraColor = await awaitChooseColor()
            await playCard(socket.game,socket.userid,card,extraColor)
            await socketPassTurn()
        })

        turnFunctionFactory('Pass Turn',async ()=>{
            await socketPassTurn()
        })

        socketFunctionFactory('Restart Game',async ()=>{
            const newGame = await restartGame(socket.game)
            emitToAll('New Game',newGame)
        })

        socketFunctionFactory('Add Bot',async ()=>{
            const id = socket.game.players.length
            const username = `Bot${id}🤖`
            await addBot(socket.game,username)
            update()
        })

        socket.on('Emote',(emoji)=>io.volatile.to(socket.room).emit('Emote',{emoji,userid:socket.userid}))
    })
}