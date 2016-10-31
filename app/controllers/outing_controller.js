import Outing from '../models/outing_model';
var consts = require('../consts.js');

export const createOuting = (req, res) => {
	const outing = new Outing();
	outing.title = "hello!";
	outing.description = "description";

	outing.save()
		.then(result => {
			console.log('outing created!')
		})
	.catch(error => {
		console.log('error')
	});
};

export const getOutings = (req, res) => {
	Outing.find({}, function(err,obj) { console.log(obj); });
};

export const getRandomOuting = (req, res) => {
  	Outing
		.count()
		.exec((err, count) => {
			let skip = Math.floor(Math.random() * count);
			Outing.findOne().skip(skip).exec(function(err, obj) {
				if (err) {
					return res.send();
				}
				res.json({ message: obj });
			});
		});
};

export const initiateOuting = (req, res) => {
	var duration = req.query.duration;
	var participants = req.query.participants;
	if (participants == 'UNLIMITED') {
		participants = consts.MAX;
	};

	//TODO: will need to change this when an activity doesn't have unlimited participants
	Outing
		.find().where('duration').lte(duration).
		count().
		exec((err, count) => {
			let skip = Math.floor(Math.random() * count);
			Outing.findOne({}).where('duration').lte(duration).
			skip(skip)
			.exec(function(err, obj) {
				getSecondStep(req, res, obj);
			});
		})
}

export const getSecondStep = (req, res, firstStep) => {
	var neededDuration = req.query.duration - firstStep.duration;
	Outing.
		findOne({'duration': neededDuration}).
		// where('participants').lte(participants).
		exec(function(err, obj) {
			if (obj == null) {
				Outing.findOne({'duration': req.query.duration}).exec(function(err, obj) {
					res.json({
						'detailedSteps': [obj]
					});
				});
			} else {
				res.json({
					'detailedSteps': [firstStep, obj]
				})
			}
		});
}

export const getRandomOutingStudy = (callback) => {
	Outing
		.count()
		.exec((err, count) => {
			let skip = Math.floor(Math.random() * count);
			Outing.findOne().skip(skip).exec(callback);
		});
}


//get total duration of outing from request
//get random outing that is equal to or under that duration --??
//use this outing
//get another outing that fills the remainer of the time difference
