import React from 'react';

interface CheckboxProps {
  id: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({ id, checked, onChange, label }) => {
  return (
    <div className="flex items-center">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
        className="form-checkbox h-5 w-5 text-blue-600"
      />
      <label htmlFor={id} className="ml-2 text-sm">
        {label}
      </label>
    </div>
  );
};