import { Router } from 'express';
import { requireAuth, requireSignin } from './services/passport';

import * as Config from './controllers/config_controller';
import * as Outings from './controllers/outing_controller';
import * as Reflections from './controllers/reflection_controller';
import * as Steps from './controllers/step_controller';
import * as Users from './controllers/user_controller';

const router = Router();

router.get('/', (req, res) => {
    res.json({ message: 'Welcome to your outings!!' });
});

router.route('/config')
	.get(requireAuth, Config.getConfigData);

// example post from postman: http://localhost:9090/api/signin?phoneNumber=1234567890&password=password
router.post('/signin', requireSignin, Users.signin);

router.post('/signup', Users.signup);

// example get from postman: http://localhost:9090/api/outing?duration=6
router.route('/outing')
    .get(requireAuth, Outings.handleOutingRequest)
    .post(requireAuth, Outings.submitOuting);

router.route('/randomStep')
    .get(requireAuth, Outings.getRandomStep);

router.route('/reflection')
	.post(requireAuth, Reflections.addReflection)
	.get(requireAuth, Reflections.getReflection);

router.route('/signup')
    .get(Users.signup);

// example post from postman: http://localhost:9090/api/step?title=River&description=test&lat=45.6345934&lng=23.234234
router.route('/step')
	.post(requireAuth, Steps.submitStep);

// example post from postman: http://localhost:9090/api/user?outingId=5836092e061b4b1a1b2b85cf&currentStep=1
router.route('/user')
	.get(requireAuth, Users.getOutingProgress)
	.post(requireAuth, Users.updateUser);

router.route('/user/history')
	.get(requireAuth, Users.getUserProfile);

export default router;
