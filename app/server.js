
import mongoose from 'mongoose';
const util = require('util')
var http = require("http");

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

//ping Heroku every 5 minutes
setInterval(function() {
    http.get("http://obscure-mesa-42867.herokuapp.com/");
    console.log('pinged!');
}, 300000);

var Users = require('./controllers/user_controller')
var Outings = require('./controllers/outing_controller')

let bot = controller.spawn({})

controller.setupWebserver(process.env.PORT ||  3001, function (err, webserver) {
  controller.createWebhookEndpoints(controller.webserver, bot, function () {
    console.log('TwilioSMSBot is online!')
  })
})

setInterval(function() {
    Users.getJournalUsers((err, users) => {
        for (var i = 0; i < users.length; i++) {
            var phoneNumber = users[i].phoneNumber
            console.log(phoneNumber)
            var message = {
                from: '+14082146413',
                to: phoneNumber,
                user: phoneNumber,
                channel: phoneNumber
            }
            bot.startConversation(message, (err, convo) => {
                convo.ask('Send us a short description of something memorable you did in the past two days!', (res, convo) => {
                    console.log('heres what they did' + res.text)
                    convo.say('Awesome! Thanks.')
                    convo.next()
                })
            })
        }
    })
}, 7200000);
 
controller.hears(['I want an outing!'], 'message_received', (bot, message) => {
    bot.startConversation(message, (err, convo) => {
        convo.say('Woo hoo! Finding you one now.')
        Outings.getRandomOuting((err, outing) => {
            console.log('got outing')
            console.log(outing.title)
            convo.say(`Outing name: ${outing.title}`)
            convo.say(`Outing description: ${outing.description}`)
          })
      })
})



// controller.hears(['I want an outing!'], 'message_received', (bot, message) => {
//   bot.startConversation(message, (err, convo) => {
//     convo.ask('Woo hoo! How many hours? (1 hour increments only. Ex: 2, 3, 4)', (res, convo) => {
//       convo.say(`Okay, finding you an outing for ${res.text} hours!`)
//       var duration = res.text
//       console.log(duration)
//       Outings.getRandomOuting((err, outing) => {
//         convo.say(`Outing name: ${outing.title}`)
//         convo.say(`Outing description: ${outing.description}`)
//       })
//       convo.next()
//     })
//   })
// })

controller.hears(['Journal'], 'message_received', (bot, message) => {
  console.log('da message user: ' + message.user)
  bot.startConversation(message, (err, convo) => {
    convo.ask('Type in your journal entry! ', (res, convo) => {
        Users.saveJournalEntry(message.user, res.text)
        convo.say('Thanks! Feel free to journal any time you do something exciting!')
        convo.next()
    })
  })
})


controller.hears(['COMMANDS'], 'message_received', (bot, message) => {
  bot.startConversation(message, (err, convo) => {
    var phoneNumber = message.user
    var user = Users.getUser((err, user, phoneNumber) => {
        if (user.group == 1) {
            convo.say('Type "I want an outing!" to generate an outing for a specified time increment. \
                Type "Journal" to record a memorable activity you\'ve participated in!')
        }
        else {
            convo.say('Type "Journal" to record a memorable activity you\'ve participated in!')
        }
    }, phoneNumber)
  })
})

controller.hears('.*', 'message_received', (bot, message) => {
  bot.reply(message, 'Huh? Type "COMMANDS" for available commands.')
})
