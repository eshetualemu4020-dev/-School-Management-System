import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authenticateToken } from '../../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();
const controller = new AuthController();
const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	skipSuccessfulRequests: true,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: { code: 'LOGIN_RATE_LIMITED', message: 'Too many sign-in attempts. Please try again later.' } }
});
const recoveryLimiter = rateLimit({
	windowMs: 60 * 60 * 1000,
	limit: 5,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: { code: 'RECOVERY_RATE_LIMITED', message: 'Too many recovery requests. Please try again later.' } }
});

router.post('/register', controller.register);
router.post('/login', loginLimiter, controller.login);
router.post('/logout', controller.logout);
router.post('/forgot-password', recoveryLimiter, controller.forgotPassword);
router.post('/reset-password', recoveryLimiter, controller.resetPassword);
router.get('/me', (req, res, next) => {
	const hasBearer = Boolean(req.headers.authorization?.startsWith('Bearer '));
	const hasSessionCookie = req.headers.cookie?.split(';').some((item) => item.trim().startsWith('hspsms_session='));
	if (!hasBearer && !hasSessionCookie) {
		res.status(200).json({ data: null });
		return;
	}
	next();
}, authenticateToken, controller.me);

export default router;
