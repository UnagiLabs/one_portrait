"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type UnitFullState = {
  readonly isFull: boolean;
  readonly markFullIfAtCap: (submittedCount: number, maxSlots: number) => void;
};

const UnitFullStateContext = createContext<UnitFullState>({
  isFull: false,
  markFullIfAtCap: () => undefined,
});

export function UnitFullStateProvider({
  children,
  initialFull,
}: {
  readonly children: React.ReactNode;
  readonly initialFull: boolean;
}): React.ReactElement {
  const [isFull, setIsFull] = useState(initialFull);

  const markFullIfAtCap = useCallback(
    (submittedCount: number, maxSlots: number): void => {
      if (maxSlots > 0 && submittedCount >= maxSlots) {
        setIsFull(true);
      }
    },
    [],
  );

  const value = useMemo(
    () => ({
      isFull,
      markFullIfAtCap,
    }),
    [isFull, markFullIfAtCap],
  );

  return (
    <UnitFullStateContext.Provider value={value}>
      {children}
    </UnitFullStateContext.Provider>
  );
}

export function useUnitFullState(): UnitFullState {
  return useContext(UnitFullStateContext);
}
