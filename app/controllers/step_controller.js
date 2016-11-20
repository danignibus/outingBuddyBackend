import Step from '../models/step_model';
import dotenv from 'dotenv';
dotenv.config({ silent: true });
const util = require('util')

export const createStep = (req, res) => {
    const step = new Step();
    console.log(req.query.title);
    console.log('query' + req.query);
	console.log(util.inspect(req.query, {showHidden: false, depth: null}))

    step.title = req.query.title;
    step.description = req.query.description;
    console.log('user' + req.user);
    console.log('step' + step);
    step.save()
        .then(result => {
            res.send(result);
        })
    .catch(error => {
        res.send(error);
    });
};
