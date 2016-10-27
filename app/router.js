import { Router } from 'express';
import * as Outings from './controllers/outing_controller';


const router = Router();


router.get('/', (req, res) => {
  	res.json({ message: 'Welcome to your outings!!' });
});

router.route('/randomOuting')
  	.get(Outings.getRandomOuting);

router.route('/outing')
	.get(Outings.initiateOuting);

export default router;