import Step from '../models/step_model';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config({ silent: true });

/*
This function receives data from the client for a step submitted by a user,
and stores this step in the Mongo database.
*/
export const createStep = (req, res) => {
    const step = new Step();

    step.active = req.query.active || 0;
    step.author = req.user._id;
    step.description = req.query.description;
    step.duration = req.query.duration;
    step.image = req.query.image;
    step.loc.coordinates = [req.query.lng, req.query.lat];
    step.loc.type = 'Point';
    step.participants = req.query.participants || 'UNLIMITED';
    step.title = req.query.title;
    step.warmup = req.query.warmup || 0;
    step.approved = 0;

    step.save()
        .then(result => {
            res.send(result);
        })
    .catch(error => {
        res.send(error);
    });

    // following is from nodemailer documentation

    // using SMTP transport
    const transporter = nodemailer.createTransport('SMTP', {
        service: 'Gmail',
        auth: {
            user: process.env.APP_EMAIL,
            pass: process.env.APP_PASSWORD,
        },
    });

    // email info
    const mailOptions = {
        from: `"Outing Buddy App 👥" <${process.env.APP_EMAIL}>`, // sender address
        to: `${process.env.APP_EMAIL}`,
        subject: 'New step submission',
        text: `Got a new step! 🐴🐴🐴 Title: ${step.title}. Description: ${step.description}. Duration: ${step.duration}. Coordinates: ${step.loc.coordinates}. Active: ${step.active}. Author: ${req.user.name}. Warmup: ${step.warmup}. Image: ${step.image}`,
    };

    // send mail with defined transport object
    transporter.sendMail(mailOptions, function(error, info){
        if(error){
            return console.log(error);
        }
    });
};
