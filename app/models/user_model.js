import mongoose, { Schema } from 'mongoose';

// create a schema for outings/description
const UserSchema = new Schema({
  name: String,
  phoneNumber: String,
  group: String,
  journals: [],
  lastPrompted: Date,
});

// create model class
const User = mongoose.model('User', UserSchema);

export default User;

//structure for users; last contacted interval; something that runs periodically
//for bots that run on Heroku--either keep awake @ all times or 

//Heroku: if you have an incoming HTTP request to some path, it wakes up
//Slack: polling client. your Heroku instance polls slack 

//default Heroku plan: schedule something to hit it every hour--Heroku scheduler plugin. 
//have it listen to /checkup, when it hits URL crank through all entries and figure out whether any is over the time, then clear flags
