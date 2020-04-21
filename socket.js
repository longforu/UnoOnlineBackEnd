const jwt = require('jsonwebtoken')
const {Game,addPlayerToGame,passTurn,playCard,drawCardToPlayer,distributeInitialCard,checkWinCondition} = require('./model')

module.exports = server=>{
    const io = require('socket.io')(server)
    io.on('connect',async (socket)=>{
        const emitToAll = (message,data)=>io.to(socket.room).emit(message,data)

        const update = ()=>emitToAll('Update',socket.game)

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
            await func(data)
            const win = await checkWinCondition(socket.game)
            if(Number.isInteger(win)){
                socket.game.inGame = false
                await socker.game.save()
                return emitToAll('End Game',win)
            } 
            update()
        })

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

        socketFunctionFactory('Start Game',async ()=>{
            if(socket.game.inGame) throw Error("The game had started")
            socket.game.inGame = true
            await distributeInitialCard(socket.game)
            await passTurn(socket.game)
            update()
        })

        turnFunctionFactory('Draw Card',async ()=>{
            await drawCardToPlayer(socket.game,socket.userid)
        })

        turnFunctionFactory('Play Card',async (card)=>{
            await playCard(socket.game,socket.userid,card)
            await passTurn(socket.game)
        })

        turnFunctionFactory('Pass Turn',async ()=>{
            await passTurn(socket.game)
        })
    })
}