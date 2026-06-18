import { createContext, useContext, useState, ReactNode } from 'react';

export interface RCDONavState {
  rallyingCryId: string;
  cycleId?: string;
  currentDOId?: string;
  currentSIId?: string;
  currentTaskId?: string;
  mobileNavOpen: boolean;
}

interface RCDODetailContextValue {
  navState: RCDONavState;
  setNavState: (partial: Partial<RCDONavState>) => void;
}

const defaultNavState: RCDONavState = {
  rallyingCryId: '',
  mobileNavOpen: false,
};

const RCDODetailContext = createContext<RCDODetailContextValue>({
  navState: defaultNavState,
  setNavState: () => {},
});

export function RCDODetailProvider({ children }: { children: ReactNode }) {
  const [navState, setNavStateInternal] = useState<RCDONavState>(defaultNavState);

  const setNavState = (partial: Partial<RCDONavState>) => {
    setNavStateInternal(prev => ({ ...prev, ...partial }));
  };

  return (
    <RCDODetailContext.Provider value={{ navState, setNavState }}>
      {children}
    </RCDODetailContext.Provider>
  );
}

export function useRCDODetail() {
  return useContext(RCDODetailContext);
}
