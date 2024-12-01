import React from 'react';
import Image from 'next/image';

export default function AuthNav() {
    return (
      <div className="w-full flex items-center justify-between p-4">
        <a href="/" className="active:scale-95 transition-spring">
          <Image src="/svela-logo.svg" alt="Logo" className="" width={40} height={40} />
        </a>
      </div>
    );
  }
  