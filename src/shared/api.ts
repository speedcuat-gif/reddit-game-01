export type DailyResponse = {
  type: 'daily';
  date: string;
  par: number;
  wells: number;
  rocks: number;
};

export type ScoreRequest = {
  shots: number;
};

export type ScoreResponse = {
  type: 'score';
  best: number | null;
  playsToday: number;
  streak: number | null;
  offline?: boolean;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};
