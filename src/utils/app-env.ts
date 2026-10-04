import type { User } from '$/context/user/types';

export type ContextVariables = {
  currentUser: User;
};

export type AppEnv = {
  Variables: ContextVariables;
};
