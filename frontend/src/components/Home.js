import React from "react";
import { Card, Carousel } from "flowbite-react";

export const Home = () => {
    return (
        <div className="flex justify-center items-center h-screen">
            <div className="vh-100 d-flex align-items-center justify-content-center">
                <div className="h-56 sm:h-64 xl:h-80 2xl:h-96">
                    <Carousel>
                        <img src="https://flowbite.com/docs/images/carousel/carousel-1.svg" alt="..." />
                        <img src="https://flowbite.com/docs/images/carousel/carousel-2.svg" alt="..." />
                        <img src="https://flowbite.com/docs/images/carousel/carousel-3.svg" alt="..." />
                        <img src="https://flowbite.com/docs/images/carousel/carousel-4.svg" alt="..." />
                        <img src="https://flowbite.com/docs/images/carousel/carousel-5.svg" alt="..." />
                    </Carousel>
                    <Carousel indicators={false}>
                        <img src="https://flowbite.com/docs/images/carousel/carousel-1.svg" alt="..." />
                        <img src="https://flowbite.com/docs/images/carousel/carousel-2.svg" alt="..." />
                        <img src="https://flowbite.com/docs/images/carousel/carousel-3.svg" alt="..." />
                        <img src="https://flowbite.com/docs/images/carousel/carousel-4.svg" alt="..." />
                        <img src="https://flowbite.com/docs/images/carousel/carousel-5.svg" alt="..." />
                    </Carousel>
                </div>
                <Card className="w-full space-y-4 rounded-xl shadow-md dark:bg-gray-800">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                            Main Page Test
                        </h2>
                    </div>
                </Card>
            </div >
        </div >
    );
};
