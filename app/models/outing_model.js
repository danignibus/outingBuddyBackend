import mongoose, { Schema } from 'mongoose';

// create a schema for outings/description
const OutingSchema = new Schema({
  title: String,
  description: String,
  duration: Number,
  participants: String,
  lat: Number,
  lng: Number,
});

// create model class
const Outing = mongoose.model('Outing', OutingSchema);

export default Outing;
