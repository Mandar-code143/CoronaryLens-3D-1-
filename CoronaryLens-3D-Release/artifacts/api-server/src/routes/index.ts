import { Router, type IRouter } from "express";
import coronaryLensRouter from "./coronarylens";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(coronaryLensRouter);

export default router;
