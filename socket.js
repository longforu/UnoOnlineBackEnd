const jwt = require('jsonwebtoken')
const {Game,addPlayerToGame,passTurn,playCard,drawCardToPlayer,distributeInitialCard,checkWinCondition,restartGame} = require('./model')

module.exports = server=>{
    const io = require('socket.io')(server)
    const gameSpecificInfo = new Map()
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
            console.log(socket.game)
            if(!socket.game.inGame) throw Error("The game hasn't started yet")
            await func(data)
            const win = await checkWinCondition(socket.game)
            if(Number.isInteger(win)){
                console.log(win)
                socket.game.inGame = false
                await socket.game.save()
                return emitToAll('End Game',win)
            } 
            update()
        })

        const token = socket.handshake.query.token
        const {userid,id} = jwt.verify(token,process.env.SECRET_KEY)
        console.log(token,userid,id)
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

        socketFunctionFactory('Start Game',async ()=>{
            if(socket.game.inGame) throw Error("The game had started")
            if(socket.game.players.length === 1) throw Error("Not enough players")
            socket.game.inGame = true
            await distributeInitialCard(socket.game)
            await passTurn(socket.game)
            update()
        })

        socketFunctionFactory('Restart Game',async ()=>{

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
            await passTurn(socket.game)
        })

        turnFunctionFactory('Pass Turn',async ()=>{
            await passTurn(socket.game)
        })

        socketFunctionFactory('Restart Game',async ()=>{
            const newGame = await restartGame(socket.game)
            emitToAll('New Game',newGame)
        })
        socket.on('Emote',(emoji)=>io.volatile.to(socket.room).emit('Emote',{emoji,userid:socket.userid}))
    })
}