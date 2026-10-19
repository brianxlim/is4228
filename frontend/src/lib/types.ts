export interface Coverage {
  ticker: string;
  name: string;
  rows: number;
  start: string;
  end: string;
}

export interface DataStatus {
  source: "yfinance_live" | "local_csv_seed" | null;
  origin: "yfinance" | "synthetic_calibrated" | null;
  generated_at: string | null;
  loaded_at: string | null;
  note: string | null;
  database: string;
  total_rows: number;
  coverage: Coverage[];
}

export interface PairStats {
  asset_a: string;
  asset_b: string;
  name_a: string;
  name_b: string;
  label: string;
  rank: number;
  n_obs: number;
  start_date: string;
  end_date: string;
  correlation: number;
  price_correlation: number;
  alpha: number;
  beta: number;
  r_squared: number;
  adf_stat: number;
  adf_pvalue: number;
  adf_crit_5pct: number;
  eg_stat: number;
  eg_pvalue: number;
  is_cointegrated: boolean;
  half_life_days: number | null;
  spread_std: number;
}

export interface BacktestParams {
  asset_a: string;
  asset_b: string;
  start_date: string;
  end_date: string;
  train_split_ratio: number;
  lookback_window: number;
  entry_z: number;
  exit_z: number;
  stop_loss_z: number;
  initial_capital: number;
  transaction_cost_bps: number;
  hedge_mode: "static" | "rolling";
  hedge_window: number;
  execution_lag: number;
}

export interface TsRow {
  date: string;
  price_a: number;
  price_b: number;
  norm_a: number;
  norm_b: number;
  log_a: number;
  hedged_log_b: number | null;
  spread: number | null;
  zscore: number | null;
  signal: -1 | 0 | 1;
  equity: number;
  gross_equity: number;
  benchmark: number | null;
  drawdown_pct: number;
  gross_drawdown_pct: number;
  exposure: number;
  cash: number;
}

export type ExitReason = "MEAN_REVERSION" | "STOP_LOSS" | "END_OF_PERIOD";
export type Direction = "LONG_SPREAD" | "SHORT_SPREAD";

export interface Trade {
  trade_id: number;
  direction: Direction;
  entry_signal_date: string;
  entry_date: string;
  exit_signal_date: string;
  exit_date: string;
  holding_days: number;
  entry_z: number;
  exit_z: number | null;
  exit_reason: ExitReason;
  hedge_ratio: number;
  shares_a: number;
  shares_b: number;
  price_a_entry: number;
  price_a_exit: number;
  price_b_entry: number;
  price_b_exit: number;
  gross_pnl_sgd: number;
  fees_sgd: number;
  net_pnl_sgd: number;
  return_pct: number;
  is_open: boolean;
}

export interface Metrics {
  total_return_pct: number;
  cagr_pct: number | null;
  annual_volatility_pct: number;
  sharpe_ratio: number | null;
  sharpe_ratio_rf0: number | null;
  sortino_ratio: number | null;
  max_drawdown_pct: number;
  calmar_ratio: number | null;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate_pct: number | null;
  profit_factor: number | null;
  avg_holding_days: number | null;
  avg_trade_net_pnl_sgd: number | null;
  stop_loss_exits: number;
  final_equity_sgd: number;
  net_profit_sgd: number;
  total_fees_sgd: number;
  gross_total_return_pct: number;
  time_in_market_pct: number;
  avg_gross_exposure_sgd: number;
  risk_free_rate_pct: number;
}

export interface BacktestResult {
  params: BacktestParams & { gross_leverage: number; lot_size: number };
  labels: { asset_a: string; asset_b: string };
  formation: PairStats & {
    hedge_mode: string;
    trading_start: string;
    trading_end: string;
    formation_bars: number;
    trading_bars: number;
  };
  metrics: Metrics;
  benchmark_metrics: Partial<Metrics>;
  timeseries: TsRow[];
  trades: Trade[];
}
