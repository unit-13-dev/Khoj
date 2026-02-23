import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest){
    const url= req.nextUrl.searchParams.get('url');

    if(!url){
        return NextResponse.json({error: "no url passed"}, {status: 400});
    }

    try{
        const response= await fetch(url,{ 
            headers:{
                'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.instagram.com/',
                'Origin': 'https://www.instagram.com',
                'Sec-Fetch-Dest': 'image',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'cross-site',
                'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
            },
            cache: 'no-store'
        });

        if(!response.ok){
            console.error('Image fetch failed:', response.status, response.statusText, url);
            
            return new NextResponse(null, {
                status: 302,
                headers: {
                    'Location': '/reel-thumbnail-placeholder.jpg'
                }
            });
        }

        const imageBuffer= await response.arrayBuffer();
        const contentType= response.headers.get('content-type') || "image/jpeg";

        return new NextResponse(imageBuffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': "public, max-age=3600",
                'Access-Control-Allow-Origin': '*'
            }
        });

    }catch(err){
        console.error('Image proxy error:', err);
        
        return new NextResponse(null, {
            status: 302,
            headers: {
                'Location': '/reel-thumbnail-placeholder.jpg'
            }
        });
    }

}
