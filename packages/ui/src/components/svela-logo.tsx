import { cn } from "@v1/ui/cn";

interface SvelaLogoProps {
  width?: number;
  height?: number;
  className?: string;
  fillColor?: string;
  strokeColor?: string;
  strokeOpacity?: number;
}

export function SvelaLogo({ 
  width = 758, 
  height = 758, 
  className,
  fillColor = "currentColor",
  strokeColor = "currentColor", 
  strokeOpacity = 0.6 
}: SvelaLogoProps) {
  return (
    <svg 
      width={width} 
      height={height} 
      viewBox="0 0 758 758" 
      fill="none"
      className={cn("", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        fillRule="evenodd" 
        clipRule="evenodd" 
        d="M264.324 102.164C271.158 45.175 319.67 1 378.5 1H379.5C438.33 1 486.842 45.175 493.676 102.164C513.814 86.3803 538.766 77.6772 564.616 77.6774C595.116 77.6775 624.367 89.7939 645.934 111.361L646.641 112.068C688.236 153.664 691.305 219.197 655.849 264.325C712.832 271.165 757 319.674 757 378.5V379.5C757 438.326 712.832 486.835 655.849 493.675C691.306 538.804 688.236 604.337 646.64 645.933L645.933 646.64C604.337 688.236 538.804 691.306 493.675 655.849C486.835 712.832 438.326 757 379.5 757H378.5C319.67 757 271.158 712.825 264.324 655.836C244.186 671.62 219.234 680.323 193.384 680.323C162.884 680.322 133.633 668.206 112.066 646.639L111.359 645.932C69.764 604.336 66.6947 538.803 102.151 493.675C45.1683 486.835 1 438.326 1 379.5V378.5C1 319.67 45.175 271.158 102.164 264.324C86.3804 244.186 77.6774 219.234 77.6774 193.384C77.6774 162.885 89.7934 133.634 111.36 112.067L112.067 111.36C133.634 89.7934 162.885 77.6774 193.384 77.6774C219.234 77.6774 244.186 86.3804 264.324 102.164Z" 
        fill={fillColor} 
        stroke={strokeColor} 
        strokeOpacity={strokeOpacity} 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  );
}