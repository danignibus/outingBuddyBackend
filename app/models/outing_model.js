import mongoose, { Schema } from 'mongoose';

// create a schema for outings/description
const OutingSchema = new Schema({
    author: { type: Schema.Types.ObjectId, ref: 'User' },
    detailedSteps: [],
    message: String,
    stepIds: [],
    rating: Number,
    raters: Number,
    userPhoneNumber: String,
});

// create model class
const Outing = mongoose.model('Outing', OutingSchema);

export default Outing;
