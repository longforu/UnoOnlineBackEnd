const {User} = require('./user')
const {Game,addPlayerToGame,drawCardToPlayer,checkWinCondition,distributeInitialCard,playCard,passTurn,restartGame,addBot} = require('./model')
const jwt = require('jsonwebtoken')
const _ = require('lodash')

module.exports = (io)=>{
      const waitingRoom = io.of('/waitingRoom')
      const waiting = []
      const users = []

      const updatePlayers = async ()=>{
            console.log(waiting)
            if(waiting.length<=1) return
            const game = new Game({gameMode:'Competitive Player'})
            const firstCard = game.deck.splice(_.random(game.deck.length-1),1)[0]
            game.currentTopCard = firstCard
            await game.save()
            let i =0
            while(i<4){
                  if(!waiting[0]){
                        i=5
                        break
                  }
                  i++
                  console.log(waiting,users)
                  const socketid = waiting.splice(0,1)[0]
                  const user = users.splice(0,1)[0]
                  const userid = await addPlayerToGame(game,user.username,user._id,user.points)
                  const token = jwt.sign({id:game._id,userid},process.env.SECRET_KEY)
                  waitingRoom.to(socketid).emit('Game Found',{token,playerid:userid})
            }
            await updatePlayers()
      }

      waitingRoom.on('connect',async (socket)=>{
            const criticalError = (message)=>{
                  console.log(message)
                  socket.emit("Critical Error",message)
                  return socket.disconnect()
            }
            socket.on('disconnect',()=>{
                  console.log('disconnect')
                  waiting.splice(waiting.indexOf(socket.id),1)
            })

            const token = socket.handshake.query.userToken
            if(!token || token ==='null') return criticalError("Token not found")
            const {id}  = jwt.verify(token,process.env.SECRET_KEY)
            if(!id) return criticalError("Token is invalid")
            const user = await User.findById(id)
            if(!user) return criticalError("User not found")
            const index = users.findIndex((e)=>e._id===id)
            if(index>=0) waiting.splice(index,1)
            if(index>=0)users.splice(index,1)
            waiting.push(socket.id)
            users.push(user)
            await updatePlayers()
      })
}