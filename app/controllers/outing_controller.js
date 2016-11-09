var consts = require('../consts.js');
var Routific = require("routific");
var request = require('request');

const util = require('util')
import Outing from '../models/outing_model';


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

// export const initiateOuting = (req, res) => {
// 	var duration = req.query.duration;
// 	var participants = req.query.participants;
// 	if (participants == 'UNLIMITED') {
// 		participants = consts.MAX;
// 	};

// 	//TODO: will need to change this when an activity doesn't have unlimited participants
// 	Outing
// 		.find().where('duration').lte(duration).
// 		count().
// 		exec((err, count) => {
// 			let skip = Math.floor(Math.random() * count);
// 			Outing.findOne({}).where('duration').lte(duration).
// 			skip(skip)
// 			.exec(function(err, obj) {
// 				getSecondStep(req, res, obj);
// 			});
// 		})
// }


export const initiateOuting = (req, res) => {
	var duration = req.query.duration;
	// 	var participants = req.query.participants;
	// 	if (participants == 'UNLIMITED') {
	// 		participants = consts.MAX;
	// 	};

	// 	//TODO: will need to change this when an activity doesn't have unlimited participants
	var halfDuration = Math.ceil(duration/2);
	var outing = [];
	var stepIds = [];
	//find significant outing (i.e. at least half time of outing)
	Outing
		.find({'duration': halfDuration}).
		count().
		exec((err, count) => {
			let skip = Math.floor(Math.random() * count);
			Outing.findOne({'duration': halfDuration}).
			skip(skip)
			.exec(function(err, obj) {
				// getSecondStep(req, res, obj);
				outing.push(obj);
				stepIds.push(obj._id);
				var remainingDuration = req.query.duration - obj.duration;
				console.log(remainingDuration);
				completeOuting(req, res, outing, remainingDuration, stepIds);
			});
		})
	// 	Outing
// 		.find().where('duration').lte(duration).
// 		count().
// 		exec((err, count) => {
// 			let skip = Math.floor(Math.random() * count);
// 			Outing.findOne({}).where('duration').lte(duration).
// 			skip(skip)
// 			.exec(function(err, obj) {
// 				getSecondStep(req, res, obj);
// 			});
// 		})
// }

}

export const completeOuting = (req, res, outing, remainingDuration, stepIds) => {
	var radius = 3/3959; 
	if (remainingDuration == 0) {
		console.log('entered base case' + outing);
		res.json({
			'detailedSteps': outing
		})
		//optimizeRoute(req, res, outing);
	}
	else if (remainingDuration > 0) {
		console.log('entered not base case');
		var jsonObject = outing[0].toJSON();
		var query = {
		    "loc" : {
		        $geoWithin : {
		            $centerSphere : [jsonObject.loc.coordinates, radius ]
		        }
		    },
		    // '_id': {
		    // 	$nin: stepIds
		    // }
		};
		Outing
			.find(query).where('duration').lte(remainingDuration).
			count().
			exec((err, count) => {
				console.log('count' + count);
				let skip = Math.floor(Math.random() * count);
				Outing.findOne(query).where('duration').lte(remainingDuration).
				skip(skip)
				.exec(function(err, obj) {
					outing.push(obj);
					stepIds.push(obj._id);
					remainingDuration = remainingDuration - obj.duration;
					completeOuting(req, res, outing, remainingDuration, stepIds);
				});
			})
	}

	//get miles to radian

	// var outing2 = Outing.findOne({'title': 'Skinny pancake'})
	// 	.exec((err, obj) => {
	// 		var jsonObject = obj.toJSON();

	// 		var query = {
	// 		    "loc" : {
	// 		        $geoWithin : {
	// 		            $centerSphere : [jsonObject.loc.coordinates, radius ]
	// 		        }
	// 		    },
	// 		    '_id': {
	// 		    	$nin: stepIds
	// 		    }
	// 		};
	// 		// Step 3: Query points.
	// 		Outing.find(query)
	// 			.exec((err, obj) => {
	// 				console.log(util.inspect(obj, {showHidden: false, depth: null}))
	// 			})
	// })
}

export const optimizeRoute = (req, res, outing) => {
	var data = {};
	var visits = {};

	data.visits = visits;

	for (var i=0; i<outing.length; i++) {
		var orderName = `order_${i}`;
		var stepLocation = {
			"location": {
				"name": outing[i].title,
				"lat": outing[i].lat,
				"lng": outing[i].lng
			},
		}
		data.visits[outing[i]._id] = stepLocation;
	}

	data.fleet = {
        "vehicle_1": {
            "start_location": {
                "id": "initialLocation",
                "name": "Baker Berry",
                "lat": 43.705267,
                "lng": -72.288719
	        },
	    }
	}

	var options = {
	    url: 'https://api.routific.com/v1/vrp',
	    json: data,
	    headers: {
	        'Authorization': 'bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI1ODFhNzI1NzUwY2MxMjUxN2QxZTcwZjgiLCJpYXQiOjE0NzgxMjgyMTV9.ejaVxuKZSuk54YWfeJ7s-s7hQz91ZTIc0ntt_M6irPY'
	    }
	};
	function callback(error, response, body) {
	    if (!error && response.statusCode == 200) {
	        // TODO: Fix lookup stuff
	        console.log(body);
	        console.log(util.inspect(body, {showHidden: false, depth: null}))
	        var lookup = {};
	        for (var i = 0; i < outing.length; i++) {
	        	console.log('id' + outing[i]._id);
	        	lookup[outing[i]._id] = outing[i];
	        }
	        var finalResult = [];

	        var solution = body.solution;
	        var route = solution.vehicle_1;

	       	//NOTE: Starting at 1 because initial location is start location
	        for (var j = 1; j < route.length; j++) {
	        	var nextId = route[j].location_id;
	        	finalResult.push(lookup[nextId]);
	        }
	    	res.json({
				'detailedSteps': finalResult
			})
	    }
	    else {
	        // ... Handle error
	        console.log(response.statusCode + ': ' + body.error);
	    }
	}
	request.post(options, callback);
}

// export const getSecondStep = (req, res, firstStep) => {
// 	var neededDuration = req.query.duration - firstStep.duration;
// 	Outing.
// 		findOne({'duration': neededDuration}).
// 		where('_id').ne(firstStep._id).
// 		// where('participants').lte(participants).
// 		exec(function(err, obj) {
// 			if (obj == null) {
// 				Outing.findOne({'duration': req.query.duration}).exec(function(err, obj) {
// 					res.json({
// 						'detailedSteps': [obj]
// 					});
// 				});
// 			} else {
// 				res.json({
// 					'detailedSteps': [firstStep, obj]
// 				})
// 			}
// 		});
// }

export const getRandomOutingStudy = (callback) => {
	Outing
		.count()
		.exec((err, count) => {
			let skip = Math.floor(Math.random() * count);
			Outing.findOne().skip(skip).exec(callback);
		});
}
