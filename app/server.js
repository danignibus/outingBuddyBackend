
import mongoose from 'mongoose';

// DB Setup
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost/outingsbot';
mongoose.connect(mongoURI);
// set mongoose promises to es6 default
mongoose.Promise = global.Promise;

const TwilioSMSBot = require('botkit-sms')
const controller = TwilioSMSBot({
  account_sid: 'AC92e5ed98b84911ee8d571b78b5650c38',
  auth_token: 'c15e339ffe42774e2257fa9b4f5b3924',
  twilio_number: '+14082146413'
})

var Users = require('./controllers/user_controller')
var Outings = require('./controllers/outing_controller')

let bot = controller.spawn({})

controller.setupWebserver(process.env.PORT ||  3001, function (err, webserver) {
  controller.createWebhookEndpoints(controller.webserver, bot, function () {
    console.log('TwilioSMSBot is online!')
  })
})
 
controller.hears(['I want an outing!'], 'message_received', (bot, message) => {
  bot.startConversation(message, (err, convo) => {
    convo.ask('Woo hoo! How many hours? (1 hour increments only. Ex: 2, 3, 4)', (res, convo) => {
      convo.say(`Okay, finding you an outing for ${res.text} hours!`)
      var duration = res.text
      console.log(duration)
      Outings.getRandomOuting((err, item) => {
        convo.say(`Outing name: ${item.title}`)
        convo.say(`Outing description: ${item.description}`)
      })
     // convo.say('No outing for you!! Muahahahaha')
      convo.next()
    })
  })
})

controller.hears(['Journal'], 'message_received', (bot, message) => {
  console.log('da message: ' + message)
  console.log('da bot' + bot)
  bot.startConversation(message, (err, convo) => {
    convo.ask('Type in your journal entry! ', (res, convo) => {
      convo.say('Thanks! Feel free to journal any time you do something exciting!')
      convo.next()
    })
  })
})


controller.hears(['COMMANDS'], 'message_received', (bot, message) => {
  bot.startConversation(message, (err, convo) => {
    //get user type

    //if user type == JOURNAL

    //get recording

    //else if user type == OUTINGS
    convo.say('Type "I want an outing!" to generate an outing for a specified time increment')
  })
})

controller.hears('.*', 'message_received', (bot, message) => {
  bot.reply(message, 'Huh? Type "COMMANDS" for available commands.')
})
