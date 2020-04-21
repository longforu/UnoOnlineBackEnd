const express = require('express')
const app = new express
const server = require('http').createServer(app)
const {Game,addPlayerToGame} = require('./model')
const jwt = require('jsonwebtoken')
require('dotenv').config()
app.use(require('body-parser')({extended:true}))
app.use(require('morgan')('common'))
app.use(require('cors')())
require('./socket')(server)
require('mongoose').connect(process.env.MONGODB_URI)
const _ = require('lodash')

const handleSignIn = async (req,res)=>{
    console.log(req.body.id,'Hello')
    const game = await Game.findById(req.id || req.body.id)
    const userid = await addPlayerToGame(game,req.body.username)
    const token = jwt.sign({userid,id:game._id},process.env.SECRET_KEY)
    return res.send({token,playerid:userid,id:game._id})
}

app.use(express.static('./build'))
const path = require('path')
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'./build','index.html')))
app.get('/join',(req,res)=>res.sendFile(path.join(__dirname,'./build','index.html')))
app.get('/game',(req,res)=>res.sendFile(path.join(__dirname,'./build','index.html')))
app.get('/join/:id',(req,res)=>res.sendFile(path.join(__dirname,'./build','index.html')))

app.post('/create',async (req,res,next)=>{
    const game = new Game
    const firstCard = game.deck.splice(_.random(game.deck.length-1),1)[0]
    game.currentTopCard = firstCard
    await game.save()
    req.id = game._id
    console.log(game)
    next()
},handleSignIn)

app.post('/join',handleSignIn)

app.get('/:path',(req,res)=>res.sendFile(path.join(__dirname,'./build','index.html')))

const port = process.env.PORT || 4000
server.listen(port,()=>console.log('Listening on port '+port))