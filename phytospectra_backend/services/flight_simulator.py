# import os
# import asyncio
# import random
# from datetime import datetime

# from services import supabase_service
# from services.pipeline import process_image


# def generate_fake_gps(field_center):
#     lat, lon = field_center

#     return {
#         "lat": lat + random.uniform(-0.0005, 0.0005),
#         "lon": lon + random.uniform(-0.0005, 0.0005),
#     }


# async def simulate_flight(flight_id, field_id, user_id, field_center):
#     images = os.listdir("sample_images")

#     for img in images:
#         image_path = f"sample_images/{img}"

#         gps = generate_fake_gps(field_center)

#         storage_path = f"{user_id}/{flight_id}/{img}"

#         # 1. upload image
#         await supabase_service.upload_image(
#             local_path=image_path,
#             storage_path=storage_path,
#             bucket="raw-images"
#         )

#         # 2. save image metadata
#         image_row = await supabase_service.save_image({
#             "user_id": user_id,
#             "field_id": field_id,
#             "flight_id": flight_id,
#             "storage_path": storage_path,
#             "gps": gps,
#             "capture_time": datetime.utcnow().isoformat(),
#             "source": "simulation"
#         })

#         # 3. run AI pipeline
#         await process_image(
#             image_path=image_path,
#             user_id=user_id,
#             image_id=image_row["id"],
#             field_id=field_id,
#             flight_id=flight_id,
#         )

#         # simulate drone movement delay
#         await asyncio.sleep(3)