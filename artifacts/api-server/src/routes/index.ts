import { Router, type IRouter } from "express";
import healthRouter from "./health";
import wastaRouter from "./wasta";

const router: IRouter = Router();

router.use(healthRouter);
router.use(wastaRouter);

export default router;
