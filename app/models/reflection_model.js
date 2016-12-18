import mongoose, { Schema } from 'mongoose';

// create a schema for outings/description
const ReflectionSchema = new Schema({
    author: { type: Schema.Types.ObjectId, ref: 'User' },
    entry: String,
    outingId: String,
    rating: Number,
});

// create model class
const Reflection = mongoose.model('Reflection', ReflectionSchema);

export default Reflection;
