import apiRouter from './router';
import express from 'express';
import mongoose from 'mongoose';

const http = require('http');

// DB Setup
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost/outingsbot';
mongoose.connect(mongoURI);
// set mongoose promises to es6 default
mongoose.Promise = global.Promise;

const app = express();

// const server = http.createServer(app);
const TwilioSMSBot = require('botkit-sms');
const controller = TwilioSMSBot({
    account_sid: process.env.TWILIO_ACCOUNT_ID,
    auth_token: process.env.TWILIO_AUTH_TOKEN,
    twilio_number: process.env.TWILIO_NUMBER,
});

const Users = require('./controllers/user_controller');
const Outings = require('./controllers/outing_controller');

const bot = controller.spawn({});

const port = process.env.PORT || 9090;
// server.listen(port);


controller.setupWebserver(port, function (err, webserver) {
    // webserver.routes = routes;

    controller.createWebhookEndpoints(webserver, bot, function () {
        webserver.use('/api', apiRouter);
        // NOTE: if sending SMS is reimplemented, must format phone number to include country code
        // before sending!
        // webserver.get('/remind', (req, res) => {
        //     // for each user, if their last prompted is undefined
        //     // or more than 1 hour ago, send a reminder
        //     Users.getUsers((err, users) => {
        //         for (let i = 0; i < users.length; i++) {
        //             const lastPrompted = users[i].lastPrompted;
        //             const timeBetweenPrompts = 259200000;
        //             let timeElapsed;
        //             if (lastPrompted !== undefined) {
        //                 timeElapsed = new Date().getTime() - lastPrompted.getTime();
        //             }
        //             if (lastPrompted === undefined || timeElapsed > timeBetweenPrompts) {
        //                 Users.updateLastPrompted(users[i].phoneNumber);

        //                 const phoneNumber = users[i].phoneNumber;
        //                 const message = {
        //                     from: '+14082146413',
        //                     to: phoneNumber,
        //                     user: phoneNumber,
        //                     channel: phoneNumber,
        //                 };
        //                 bot.startConversation(message, (err, convo) => {
        //                     if (err) {
        //                         console.log(err);
        //                     }
        //                     convo.say('Thanks for participating in our thesis! Please text in "Record" to initiate recording a great experience from the past three days')
        //                     convo.next();
        //                 });
        //             }
        //         }
        //     });
        //     res.send('Reminder page');
        // });

    });
});

// controller.hears(['Outing'], 'message_received', (bot, message) => {
//     bot.startConversation(message, (err, convo) => {
//         Outings.getRandomOutingStudy((err, outing) => {
//             convo.say(`${outing.description}`);
//         });
//     });
// });

// controller.hears(['Record'], 'message_received', (bot, message) => {
//     bot.startConversation(message, (err, convo) => {
//         convo.ask('Type in a short entry about your best experience from the past three days! Please only send one text.', (res, convo) => {
//             Users.saveJournalEntry(message.user, res.text);
//             convo.say('Thanks! Your entry was recorded.');
//             convo.next();
//         });
//     });
// });

// controller.hears(['COMMANDS'], 'message_received', (bot, message) => {
//     bot.startConversation(message, (err, convo) => {
//         const phoneNumber = message.user;
//         const user = Users.getUser((err, user, phoneNumber) => {
//             if (user.group === 1) {
//                 convo.say('Type "Outing" to generate a random outing. Type "Record" to record a memorable activity you\'ve participated in recently!');
//             } else {
//                 convo.say('We\'ll be prompting you for an entry soon. Stay tuned!');
//             }
//         }, phoneNumber);
//     });
// });

// controller.hears('.*', 'message_received', (bot, message) => {
//     bot.reply(message, 'Huh? Type "COMMANDS" for available commands.');
// });

