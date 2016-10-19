import express from 'express';
import mongoose from 'mongoose';
const util = require('util')
var http = require("http");

// DB Setup
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost/outingsbot';
mongoose.connect(mongoURI);
// set mongoose promises to es6 default
mongoose.Promise = global.Promise;

const app = express();
const server = http.createServer(app);
const TwilioSMSBot = require('botkit-sms')
const controller = TwilioSMSBot({
  account_sid: 'AC92e5ed98b84911ee8d571b78b5650c38',
  auth_token: 'c15e339ffe42774e2257fa9b4f5b3924',
  twilio_number: '+14082146413'
})

var Users = require('./controllers/user_controller')
var Outings = require('./controllers/outing_controller')

let bot = controller.spawn({})

app.get('/remind', (req, res) => {
    //get all users
    console.log('hello!');
    //for each user, if their last prompted has been more than 2 minutes, send a reminder


    res.send('Reminder page');
});

const port = process.env.PORT || 9090;
// server.listen(port);



controller.setupWebserver(port, function (err, webserver) {
    // webserver.routes = routes;

    controller.createWebhookEndpoints(webserver, bot, function () {
        console.log(webserver);
        webserver.get('/remind', (req, res) => {
            //get all users
            console.log('Pinged reminder page');
            //for each user, if their last prompted has been more than 2 minutes, send a reminder
        });

        console.log('TwilioSMSBot is online!')
    })
})

setInterval(function() {
    Users.getUsers((err, users) => {
        for (var i = 0; i < users.length; i++) {
            var phoneNumber = users[i].phoneNumber
            console.log(phoneNumber)
            var message = {
                from: '+14082146413',
                to: '+14086076374',
                user: '+14086076374',
                channel: '+14086076374'
            }
            bot.startConversation(message, (err, convo) => {
                if (err) {
                    console.log(err);
                }
                convo.say('Please text in "Journal" to initiate recording a memorable experience from the past two days')
                convo.next();
            })
        }
    })
}, 7200000);
 
controller.hears(['I want an outing!'], 'message_received', (bot, message) => {
    bot.startConversation(message, (err, convo) => {
        convo.say('Woo hoo! Finding you one now.')
        Outings.getRandomOuting((err, outing) => {
            convo.say(`Outing name: ${outing.title}`)
            convo.say(`Outing description: ${outing.description}`)
        })
    })
})

controller.hears(['Journal'], 'message_received', (bot, message) => {
  console.log('da message user: ' + message.user)
  bot.startConversation(message, (err, convo) => {
    convo.ask('Type in your journal entry! Please only send one text.', (res, convo) => {
        Users.saveJournalEntry(message.user, res.text)
        convo.say('Thanks! Your entry was recorded.')
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
            convo.say('We\'ll be prompting you for a journal entry soon. Stay tuned!')
        }
    }, phoneNumber)
  })
})

controller.hears('.*', 'message_received', (bot, message) => {
  bot.reply(message, 'Huh? Type "COMMANDS" for available commands.')
})

