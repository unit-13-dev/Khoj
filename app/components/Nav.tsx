"use client";

import Link from "next/link";
import { useUser, useClerk } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";

export default function Nav(){

  const {user, isLoaded, isSignedIn}= useUser();
  const { signOut }= useClerk();
  const [showDropdown, setShowDropdown]= useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(()=>{
    function handleClickOutsideDropdown(event: MouseEvent){
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)){
            setShowDropdown(false);
        };
    }          

    document.addEventListener('mousedown', handleClickOutsideDropdown);
    return () => document.removeEventListener('mousedown', handleClickOutsideDropdown);
  }, []);

  return(
    <nav className="flex w-full justify-between items-center px-6 py-4 relative z-50">
        <Link href='/' className= "text-xl font-bold text-forground">Khoj</Link>

        <div className="flex items-center gap-4">
          {isSignedIn && isLoaded && (
            <>
              <Link 
                href="/planner" 
                className="text-foreground hover:text-muted-foreground transition-colors"
              >
                Trip Planner
              </Link>
              
              <Link 
                href="/map" 
                className="text-foreground hover:text-muted-foreground transition-colors"
              >
                Map
              </Link>
              
              <div className='relative flex items-center' ref={dropdownRef}>
                <button 
                  onClick={() => setShowDropdown(!showDropdown)} 
                  className="rounded-full overflow-hidden w-10 h-10 border-2 border-border hover:border-foreground transition-colors"
                >
                  <img src={user.imageUrl} alt="Profile" className="object-cover w-full h-full"/>
                </button>

                {showDropdown && (
                  <div className="absolute right-0 top-full mt-2 bg-background border border-border rounded-lg shadow-lg py-2 min-w-[160px]">
                    <Link 
                      href="/profile" 
                      className="block px-4 py-2 text-foreground hover:bg-accent transition-colors"
                      onClick={() => setShowDropdown(false)}
                    >
                      Profile
                    </Link>
                    <button 
                      onClick={() => signOut()} 
                      className="w-full text-left px-4 py-2 text-foreground hover:bg-accent transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

        {isLoaded && !isSignedIn && (
            <Link href="/auth" className= "bg-foreground text-background px-4 py-2 rounded-lg hover:bg-foreground/90 transition-colors">Sign In</Link>
        )}
        </div>
    </nav>
  )
}