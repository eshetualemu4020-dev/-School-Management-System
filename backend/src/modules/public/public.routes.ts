import { Router } from 'express';
import { PublicController } from './public.controller';

const router = Router();
const controller = new PublicController();

router.get('/home', controller.getHome);

export default router;
