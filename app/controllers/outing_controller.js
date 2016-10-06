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

export const getRandomOuting = (callback) => {
	Outing
		.count()
		.exec((err, count) => {
			let skip = Math.floor(Math.random() * count);
			Outing.findOne().skip(skip).exec(callback);
		});
	}
