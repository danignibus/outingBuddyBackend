import User from '../models/user_model';

// export const getUser = (req, res) => {
// 	Outing.find({}, function(err,obj) { console.log(obj); });
// };

// export const getUserType = (req, res) => {
// 	User.find({}, function(err, obj) { console.log(obj);});
// };

export const getUser = (callback, phoneNumber) => {
	User.findOne({ 'phoneNumber': phoneNumber }).exec(callback);
}


// export const getRandomOuting = (callback) => {
// 	Outing
// 		.count()
// 		.exec((err, count) => {
// 			let skip = Math.floor(Math.random() * count);
// 			Outing.findOne().skip(skip).exec(callback);
// 		});
// 	}
