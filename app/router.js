import { Router } from 'express';
import * as Outings from './controllers/outing_controller';
import * as Users from './controllers/user_controller';
import { requireAuth, requireSignin } from './services/passport';

const router = Router();


router.get('/', (req, res) => {
    res.json({ message: 'Welcome to your outings!!' });
});

router.post('/signin', requireSignin, Users.signin);

router.post('/signup', Users.signup);

router.route('/randomOuting')
    .get(requireAuth, Outings.getRandomOuting);

//TODO: comment back in once Kevin implements auth
// router.route('/outing')
//     .get(requireAuth, Outings.initiateOuting);

router.route('/outing')
    .get(Outings.initiateOuting);

router.route('/signup')
    .get(Users.signup);

export default router;