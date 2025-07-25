import React from 'react';
import Link from 'next/link';
import { SvelaLogo } from '@v1/ui/svela-logo';

export default function AuthNav() {
    return (
      <div className="w-full flex items-center justify-between p-4">
        <Link href="/" className="active:scale-95 transition-spring">
          <SvelaLogo 
              width={25} 
              height={25}
              adaptive={true}
            />
        </Link>
      </div>
    );
  }
  