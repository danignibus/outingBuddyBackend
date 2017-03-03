import mongoose, { Schema } from 'mongoose';

const linkedStepSchema = new Schema({
    _id: Schema.Types.ObjectId,
    avgPrice: Number,
    duration: Number,
    minPrice: Number,
    order: String,
    score: Number,
});

// create a schema for outings/description
const StepSchema = new Schema({
    active: { type: Number, required: true },
    approved: Number,
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    avgPrice: Number,
    description: { type: [String], required: true },
    duration: { type: Number, required: true },
    durationRange: [Number],
    image: String,
    // linkedSteps: {
    //     String: {
    //         duration: Number,
    //         rating: Number,
    //     },
    // },
    linkedPost: Boolean,
    linkedSteps: [linkedStepSchema],
    loc: {
        type: { type: String },
        coordinates: [Number],
    },
    maxPrice: Number,
    minPrice: Number,
    repeat_interval: String,
    repeat_start: Number,
    title: { type: String, required: true },
    participants: String,
    spend: Number,
    warmup: Number,
});

// create model class
const Step = mongoose.model('Step', StepSchema);

export default Step;
