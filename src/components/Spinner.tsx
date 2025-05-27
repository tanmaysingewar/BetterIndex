import React from "react";

export default function Spinner({ className }: { className?: string }) {
  return (
    <div className="flex">
      {/* classname is not there then set w-5 h-5 */}
      <div
        className={`relative rounded-full perspective-[800px] ${
          className || "w-[30px] h-[30px]"
        }`}
      >
        <div className="absolute w-full h-full rounded-full border-b-[3px] border-solid border-black dark:border-[#efeffa] animate-[rotate-one_1s_linear_infinite]"></div>
        <div className="absolute w-full h-full rounded-full border-r-[3px] border-solid border-black dark:border-[#efeffa] animate-[rotate-two_1s_linear_infinite]"></div>
        <div className="absolute w-full h-full rounded-full border-t-[3px] border-solid border-black dark:border-[#efeffa] animate-[rotate-three_1s_linear_infinite]"></div>
      </div>
    </div>
  );
}

// Define the keyframes in your tailwind.config.js
// @keyframes rotate-one {
//   0% {
//     transform: rotateX(35deg) rotateY(-45deg) rotateZ(0deg);
//   }
//   100% {
//     transform: rotateX(35deg) rotateY(-45deg) rotateZ(360deg);
//   }
// }
//
// @keyframes rotate-two {
//   0% {
//     transform: rotateX(50deg) rotateY(10deg) rotateZ(0deg);
//   }
//   100% {
//     transform: rotateX(50deg) rotateY(10deg) rotateZ(360deg);
//   }
// }
//
// @keyframes rotate-three {
//   0% {
//     transform: rotateX(35deg) rotateY(55deg) rotateZ(0deg);
//   }
//   100% {
//     transform: rotateX(35deg) rotateY(55deg) rotateZ(360deg);
//   }
// }
