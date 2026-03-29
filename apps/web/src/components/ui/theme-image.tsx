import Image, { type ImageProps } from 'next/image';
import { cn } from '@/lib/utils';

interface ThemeImageProps extends Omit<ImageProps, 'src'> {
  srcLight: string;
  srcDark: string;
}

export function ThemeImage({ srcLight, srcDark, className, ...props }: ThemeImageProps) {
  return (
    <>
      <Image src={srcDark} className={cn(className, 'hidden dark:block')} {...props} />
      <Image src={srcLight} className={cn(className, 'block dark:hidden')} {...props} />
    </>
  );
}
