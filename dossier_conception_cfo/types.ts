export type MoneyCents = number;
export type StrategyMode = 'MAX_WEALTH'|'FINANCIAL_FREEDOM'|'BALANCED'|'DEFENSIVE';
export interface Goal { id:string; name:string; category:string; targetValueCents?:MoneyCents; priority:number; status:string; }
export interface Project { id:string; name:string; priority:number; status:string; targetCostCents?:MoneyCents; expectedRoi?:number; confidence?:number; }
export interface CfoContext { availableCashCents:MoneyCents; emergencyFundCents:MoneyCents; emergencyTargetCents:MoneyCents; householdMonthlySpendCents:MoneyCents; businessCashCents:MoneyCents; monthlyBusinessNetCents:MoneyCents; investmentsValueCents:MoneyCents; speculativeValueCents:MoneyCents; goals:Goal[]; activeProjects:Project[]; strategyMode:StrategyMode; }
export interface AllocationDecision { bucket:string; amountCents:MoneyCents; priority:number; ruleId:string; explanation:string; metadata?:Record<string,unknown>; }
