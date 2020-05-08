const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
      username:{type:String,max:1000,required:true,unique:true},
      password:{type:String,max:1000,required:true},
      points:{type:Number,default:0},
      karma:{type:Number,default:5},
      gamePlayed:{type:Number,default:0},
      gameWon:{type:Number,default:0},
      gameLost:{type:Number,default:0}
})

const User = mongoose.model('users',userSchema)

const userFunctionFactory = (func)=>async(...args)=>{
      try{var result = await func(...args)}catch(e){console.log(e);return {error:true,message:e.message}}
      return result
}

const findRank =userFunctionFactory(async (id)=>{
      let users = await User.find({}).select('points').sort('-points')
      return {rank:[users.findIndex(e=>e._id.toString() === id)+1,users.length+1]}
})

const bcrypt = require('bcrypt')
const Filter = require('bad-words')
const filter = new Filter

const addUser = userFunctionFactory(async (username,pw)=>{
      let password = await bcrypt.hash(pw,10)
      if(filter.isProfane(username)) throw Error('Invalid username')
      let user = new User({username,password})
      await user.save()
      return {user}
})

const addPoints = userFunctionFactory(async (id,point)=>{
      const user = await User.findById(id)
      user.points += point
      await user.save()
      return user
})

const changeKarma = userFunctionFactory(async (id,point)=>{
      const user = await User.findById(id)
      user.karma += point
      if(user.karma > 10) user.karma = 10
      else if(user.karma < 0) user.karma = 0
      await user.save()
      return user
})

module.exports = {User,addUser,findRank,addPoints,changeKarma}