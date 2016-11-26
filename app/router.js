import { Router } from 'express';
import * as Outings from './controllers/outing_controller';
import * as Steps from './controllers/step_controller';
import * as Users from './controllers/user_controller';
import { requireAuth, requireSignin } from './services/passport';

const router = Router();

router.get('/', (req, res) => {
    res.json({ message: 'Welcome to your outings!!' });
});

// example post from postman: http://localhost:9090/api/signin?phoneNumber=1234567890&password=password
router.post('/signin', requireSignin, Users.signin);

router.post('/signup', Users.signup);

router.route('/randomStep')
    .get(requireAuth, Outings.getRandomStep);

// TODO: requireAuth for outing
// router.route('/outing')
//     .get(requireAuth, Outings.initiateOuting);

// example get from postman: http://localhost:9090/api/outing?duration=6
router.route('/outing')
    .get(Outings.initiateOuting);

// example post from postman: http://localhost:9090/api/step?title=River&description=test&lat=45.6345934&lng=23.234234
router.route('/step')
	.post(requireAuth, Steps.createStep);

// TODO: requireAuth for user
// example get from postman: http://localhost:9090/api/user
// example post from postman: http://localhost:9090/api/user?outingId=5836092e061b4b1a1b2b85cf&currentStep=1
router.route('/user')
	.get(Users.getOutingProgress)
	.post(Users.updateCurrentOutingProgress);

router.route('/signup')
    .get(Users.signup);

export default router;
