'use client';

import { motion, useReducedMotion, type Variants } from 'motion/react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

const easeOut = [0.16, 1, 0.3, 1] as const;

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

const listVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.08,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0 },
};

function useMotionReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

export function MotionSection({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const ready = useMotionReady();
  const reducedMotion = useReducedMotion();

  if (!ready || reducedMotion) {
    return (
      <section id={id} className={className}>
        {children}
      </section>
    );
  }

  return (
    <motion.section
      id={id}
      className={className}
      initial={reducedMotion ? false : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, amount: 0.22 }}
      variants={sectionVariants}
      transition={{ duration: reducedMotion ? 0 : 0.35, ease: easeOut }}
    >
      {children}
    </motion.section>
  );
}

export function MotionList({ children, className }: { children: ReactNode; className?: string }) {
  const ready = useMotionReady();
  const reducedMotion = useReducedMotion();

  if (!ready || reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={reducedMotion ? false : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, amount: 0.25 }}
      variants={reducedMotion ? undefined : listVariants}
    >
      {children}
    </motion.div>
  );
}

export function MotionItem({ children, className }: { children: ReactNode; className?: string }) {
  const ready = useMotionReady();
  const reducedMotion = useReducedMotion();

  if (!ready || reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={reducedMotion ? undefined : itemVariants}
      transition={{ duration: reducedMotion ? 0 : 0.3, ease: easeOut }}
    >
      {children}
    </motion.div>
  );
}

export function HeroScreenshotMotion({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ready = useMotionReady();
  const reducedMotion = useReducedMotion();

  if (!ready || reducedMotion) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 12, rotateX: 1 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.5, ease: easeOut, delay: 0.42 }}
    >
      {children}
    </motion.div>
  );
}

export function MotionStatusBadge({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ready = useMotionReady();
  const reducedMotion = useReducedMotion();

  if (!ready || reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
      whileInView={reducedMotion ? undefined : { opacity: 1, scale: [0.96, 1.04, 1] }}
      viewport={{ once: true, amount: 0.8 }}
      transition={{ duration: reducedMotion ? 0 : 0.35, ease: easeOut, delay }}
    >
      {children}
    </motion.div>
  );
}
