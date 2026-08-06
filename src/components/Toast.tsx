import React from "react";

interface Props { show: boolean; message: string; onClose: () => void; }

export const Toast = ({ show, message, onClose }: Props) => {
  if (!show) return null;
  return (
    <div className="toast">
      <span>{message}</span>
      <button className="toast-close" onClick={onClose}>×</button>
    </div>
  );
};
