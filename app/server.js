
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

var Outing = require('./models/outing_model')
var Outings = require('./controllers/outing_controller')

let bot = controller.spawn({})

controller.setupWebserver(process.env.PORT ||  3001, function (err, webserver) {
  controller.createWebhookEndpoints(controller.webserver, bot, function () {
    console.log('TwilioSMSBot is online!')
  })
  Outings.createOuting();
})

 
controller.hears(['I want an outing!'], 'message_received', (bot, message) => {
  bot.startConversation(message, (err, convo) => {
    convo.say('Woo hoo!')
    convo.ask('How many hours? (1 hour increments only. Ex: 2, 3, 4)', (res, convo) => {
      convo.say(`Okay, finding you an outing for ${res.text} hours!`)
      convo.next()
    })
  })
})


controller.hears(['COMMANDS'], 'message_received', (bot, message) => {
  bot.startConversation(message, (err, convo) => {
    convo.say('Type "I want an outing!" to generate an outing for a specified time increment')
  })
})

controller.hears('.*', 'message_received', (bot, message) => {
  bot.reply(message, 'Huh? Type "COMMANDS" for available commands.')
})
