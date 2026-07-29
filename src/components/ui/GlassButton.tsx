import { motion } from 'framer-motion'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import type { HTMLMotionProps } from "framer-motion";

interface Props extends HTMLMotionProps<"button"> {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}

export function GlassButton({
  children,
  variant = 'primary',
  className = '',
  ...rest
}: Props) {
  return (
    <motion.button
      className={`glass-button ${variant === 'secondary' ? 'secondary' : ''} ${className}`}
      whileTap={{ scale: 0.97 }}
      {...rest}
    >
      {children}
    </motion.button>
  )
}