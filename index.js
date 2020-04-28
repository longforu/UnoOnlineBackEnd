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
const axios = require('axios')
const notify = ()=>{
    try{
        axios.post('http://unomailer.herokuapp.com')
    }catch(e){}
}
const handleSignIn = async (req,res)=>{
    const game = await Game.findById(req.id || req.body.id)
    if(game.inGame || game.players.length === 4) return res.status(400)
    const userid = await addPlayerToGame(game,req.body.username || req.username,req.userid,req.point)
    const token = jwt.sign({userid,id:game._id},process.env.SECRET_KEY)
    console.log(userid,token,game._id)
    return res.send({token,playerid:userid,id:game._id})
}

app.use(express.static('./build'))
const path = require('path')
app.get('/join/:id',(req,res)=>res.sendFile(path.join(__dirname,'./build','index.html')))
app.post('/create',async (req,res,next)=>{
    const houseRule = req.body.houseRule
    const game = new Game({houseRule})
    notify()
    const firstCard = game.deck.splice(_.random(game.deck.length-1),1)[0]
    game.currentTopCard = firstCard
    await game.save()
    req.id = game._id
    console.log(game)
    next()
},handleSignIn)

app.post('/join',handleSignIn)

const {User,addUser,findRank,addPoints,changeKarma} = require('./user')
const passport = require('passport')
const localStrategy = require('passport-local').Strategy
const passportJwt = require('passport-jwt')

const bcrypt = require('bcrypt')
passport.use('local',new localStrategy({},async (username,password,done)=>{
    let user = await User.findOne({username})
    if(!user) done(null,false,'Username or password is incorrect')
    const tf = await bcrypt.compare(password,user.password)
    if(!tf) done(null,false,'Username or password is incoorect')
    return done(null,user)
}))

const extractor = passportJwt.ExtractJwt.fromAuthHeaderWithScheme('JWT')
const jwtstrategy = passportJwt.Strategy
passport.use('jwt',new jwtstrategy({
    jwtFromRequest:extractor,
    secretOrKey:process.env.SECRET_KEY,
},({id},done)=>done(null,id)))

app.use(passport.initialize())

app.post('/signup',async (req,res)=>{
    const {username,password} = req.body
    if(!username || ! password) return res.send({error:true,message:"Invalid data"})
    const {user,error,message} = await addUser(username,password)
    if(error) return res.send({error,message})
    const token = jwt.sign({id:user._id},process.env.SECRET_KEY)
    return res.send({token})
})

app.post('/login',async (req,res,next)=>{
    passport.authenticate('local',(error,data,info)=>{
        if(error) return res.send({error:true,message:'Server Error'})
        if(info) return res.send({error:true,message:info})
        else return res.send({token:jwt.sign({id:data._id},process.env.SECRET_KEY)})
    })(req,res,next)
})

const auth = (req,res,next)=>{
    passport.authenticate('jwt',(error,data,info)=>{
        if(error) return res.send({error:true,message:'Server Error'})
        if(info) return res.send({error:true,message:info})
        req.user = data
        next()
    })(req,res,next)
}

const getUser = async (req,res,next)=>{
    const user = await User.findById(req.user)
    if(!user) return res.send({error:true,message:'User not found'})
    req.player = user
    next()
}

const applyUser = async (req,res,next)=>{
    const id = req.player
    const user = await User.findById(id)
    req.userid = user._id
    req.point = user.points
    next()
}

app.post('/createUser',auth,getUser,async (req,res,next)=>{
    const {gameMode} = req.body
    const user = req.player
    const game = new Game({gameMode})
    const firstCard = game.deck.splice(_.random(game.deck.length-1),1)[0]
    game.currentTopCard = firstCard
    await game.save()
    req.username = user.username
    req.id = game._id
    next()
},applyUser,handleSignIn)

app.post('/joinUser',auth,getUser,async (req,res,next)=>{
    req.username = req.player.username
    next()
},applyUser,handleSignIn)

app.get('/user',auth,async (req,res)=>{
    const id = req.user
    let user = await User.findById(id).select('-password')
    if(!user) return res.send({error:true,message:'User not found'})
    user = user.toObject()
    const {error,message,rank} = await findRank(id)
    if(error) return res.send({error,message})
    user.rank = rank
    return res.send({user})
})

app.get('/:path',(req,res)=>res.sendFile(path.join(__dirname,'./build','index.html')))

const port = process.env.PORT || 4000
server.listen(port,()=>console.log('Listening on port '+port))