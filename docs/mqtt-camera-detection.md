# MQTT — sự kiện camera giám sát vị trí xe

Publisher bên ngoài gửi phát hiện theo topic:

```text
tenants/{tenantId}/sites/{siteId}/cameras/{cameraId}/detection
```

Ví dụ topic đầy đủ:

```text
tenants/10000000-0000-0000-0000-000000000001/sites/20000000-0000-0000-0000-000000000290/cameras/30000000-0000-0000-0000-000000000290/detection
```

Payload ví dụ:

```json
{
  "type": "vehicle_parked",
  "plateNumber": "51F-123.45",
  "zoneCode": "S03",
  "confidence": 0.93,
  "occurredAt": "2026-09-29T08:30:00+07:00"
}
```

Backend nhận qua `mqtt_bridge.dispatch()` → `handle_detection()` → `parking_service`, ghi presence/lịch sử rồi fan-out tới WebSocket của tenant. Các UUID trong ví dụ là dữ liệu minh họa; khi chạy phải thay bằng bản ghi thật. Các JSON block đều là JSON hoàn chỉnh, không phải schema giả.

**Phạm vi:** camera giám sát được cấu hình với `purpose="monitor"`, phục vụ vị trí xe trong bãi. Không phải giao thức HTTP `PlateRecognized` của Python ANPR. [ANPR worker](anpr-worker.md) hiện **không publish MQTT**, không tự gán zone mặc định và không có adapter tự chuyển lifecycle tracking thành `vehicle_parked`/`vehicle_left`.

## 1. Topic, xác thực và phạm vi kiểm tra

### Topic và format

- Topic phải khớp chính xác cấu trúc trên, phân biệt hoa/thường, không có slash cuối. Bridge subscribe `tenants/+/sites/+/cameras/+/detection` với **QoS 1**.
- `{tenantId}` là UUID tenant; `{cameraId}` là `cameras.id`, không phải tên/code camera. Publisher phải dùng `{siteId}` đúng site của camera.
- Gửi payload JSON object, tên trường camelCase. Topic lạ hoặc JSON không parse được bị log rồi bỏ qua. Body rỗng được parse thành `{}`, sau đó thiếu biển số nên không tạo presence.
- Parser MQTT này không dùng schema Pydantic của REST: JSON hợp lệ cú pháp chưa chắc hợp lệ nghiệp vụ. JSON array/null/scalar có thể gây exception trong handler; `dispatch()` log exception, không trả JSON lỗi cho publisher.

### Các lớp xác thực đã có

Backend có hook EMQX **`POST /api/v1/edge/mqtt-auth`**:

- Nhánh có password xác thực API credential qua `authenticate_api_key`: kiểm tra key, trạng thái active, thu hồi/hết hạn và yêu cầu credential gắn edge device.
- Username phải bằng `device.mqtt_client_id`, hoặc `edge-<device UUID>` khi chưa đặt client ID.
- Nhánh authorization không có password tìm device từ username và credential active/chưa bị thu hồi.
- Nếu request hook có `topic`, hook chỉ cho qua prefix **`tenants/<credential.tenant_id>/`**. Đây là kiểm tra tenant prefix, không phải ACL riêng từng site/camera hay kiểm tra quyền sở hữu camera của device. Hook hiện không tách chính sách theo `action` publish/subscribe và không áp kiểm tra scope `edge:ingest` như route presign REST.

Phải cấu hình EMQX thực sự gọi hook authn/authz để áp chính sách này. Không suy ra broker đang triển khai đã bật hook chỉ vì backend có endpoint; cũng không suy ra `handle_detection()` là endpoint công khai không có lớp xác thực. Auth broker, kiểm tra handler, quyền REST và quyền WS là các lớp khác nhau.

### `handle_detection()` thực sự xác minh gì?

- Parse tenant UUID; camera UUID không hợp lệ được log rồi bỏ qua. Tenant UUID không hợp lệ gây exception được `dispatch()` log.
- Tìm camera theo **cả `Camera.id` và `Camera.tenant_id`**. Camera không tồn tại hoặc thuộc tenant khác bị bỏ qua, không ghi dữ liệu/không fan-out.
- **Không đối chiếu `siteId` trên topic với `camera.site_id`**, không parse site topic thành UUID trong handler. Presence mới dùng site trong bản ghi camera; frame WS lại echo site trên topic. Publisher phải bảo đảm chúng nhất quán.
- **Không bắt buộc `camera.purpose == "monitor"`**, không kiểm tra camera active/status hoặc camera được gắn đúng device gửi. `monitor` là mục đích sử dụng, không phải predicate hiện có trong query này.

REST quản lý camera có xác thực tenant, role ghi và validation tham chiếu site/lane/device; schema camera cũng kiểm tra giá trị purpose. Route cập nhật coverage kiểm tra zone thuộc cùng tenant và cùng site camera. Những kiểm tra đó **không đồng nghĩa** handler MQTT kiểm tra lại toàn bộ quan hệ cho từng message.

## 2. Trường chung: type, biển số, timestamp và confidence

### `type`

Hỗ trợ đúng bốn giá trị: `vehicle_parked`, `vehicle_seen`, `vehicle_left`, `zone_snapshot`.

Nếu **thiếu** `type`, handler mặc định `vehicle_parked`; `type=null`, chuỗi rỗng hoặc giá trị lạ không dùng default mà bị log rồi bỏ qua. Nên luôn gửi `type` rõ ràng.

### `plateNumber`

Bắt buộc cho ba loại sự kiện xe. Handler chỉ kiểm tra giá trị truthy rồi ép `str(...)`; không có validation định dạng biển số hoặc ngưỡng độ dài tương đương REST. Publisher nên gửi chuỗi biển số không rỗng, tối đa 20 ký tự, chuẩn hóa còn chuỗi không rỗng tối đa 20 ký tự để phù hợp cột DB.

Backend dùng `event_service.normalize_plate()` để uppercase và bỏ mọi ký tự ngoài `A–Z`, `0–9`: `51F-123.45 → 51F12345`. Không hiệu chỉnh OCR `O/0`, không kiểm tra regex biển số Việt Nam và không có bước bỏ dấu Unicode như adapter OCR Python.

Presence mới lưu `plate_number` gốc, cắt tối đa 20 ký tự, và biển số chuẩn hóa để đối chiếu. Các lần thấy lại không thay `plate_number` đã lưu, nên WS có thể vẫn hiển thị cách viết từ lần đầu.

### `occurredAt`

Publisher nên gửi ISO-8601 có timezone, ví dụ `2026-09-29T08:30:00+07:00` hoặc `2026-09-29T01:30:00Z`.

- Handler bắt đầu bằng thời gian UTC hiện tại của server. Nếu `occurredAt` truthy, thử `datetime.fromisoformat(str(value))`; lỗi parse `ValueError`/`TypeError` thì giữ thời gian server, không từ chối message.
- Không có validation bắt buộc timezone, độ lệch đồng hồ hoặc giới hạn timestamp tương lai/quá khứ ở handler. Timestamp thiếu timezone có thể qua parser nhưng không phải định dạng nên dùng với DB timezone-aware.
- `vehicle_parked`/`vehicle_seen` dùng timestamp đã parse cho `first_seen_at` khi tạo mới, `last_seen_at` và lịch sử parked/relocated.
- `zone_snapshot` dùng timestamp này cho `camera.snapshot_captured_at` nếu có key truthy.
- **`vehicle_left` không dùng timestamp payload để đóng presence**: `mark_presence_exit()` tự lấy UTC hiện tại cho `exited_at` và event exited.
- Không có kiểm tra message mới hơn `last_seen_at`: message cũ đến muộn vẫn có thể ghi lùi timestamp hoặc đổi zone. Tránh replay dữ liệu cũ như phát hiện hiện tại.

### `confidence`

Tùy chọn với `vehicle_parked`/`vehicle_seen`; publisher nên gửi số hữu hạn trong **[0, 1]**, ví dụ `0.93`.

Handler lấy nguyên `payload.get("confidence")`, không clamp, không đổi sang float, không áp ngưỡng OCR/confidence tối thiểu. DB lưu `Numeric(5,4)`; kiểu/giá trị không phù hợp có thể lỗi ở tầng DB, không được coi là trường hợp đã qua schema validation.

Thiếu hoặc null → lưu null; lần cập nhật sau không có confidence cũng có thể ghi đè score cũ thành null. `vehicle_left` và `zone_snapshot` không dùng confidence; WS presence hiện không gửi trường này.

## 3. `vehicle_parked` và `vehicle_seen`: cùng một đường cập nhật

Ví dụ thấy lại xe, chỉ rõ zone bằng UUID:

```json
{
  "type": "vehicle_seen",
  "plateNumber": "51F12345",
  "zoneId": "40000000-0000-0000-0000-000000000003",
  "confidence": 0.91,
  "occurredAt": "2026-09-29T08:31:00+07:00"
}
```

Hai loại input gọi cùng `resolve_zone()` và `record_detection()`. Tên input **không ép** kết quả lịch sử:

1. Tìm presence active theo **tenant + biển số chuẩn hóa**, gồm trạng thái `parked` hoặc `stale`, chọn `last_seen_at` mới nhất. Không lọc theo site hoặc camera.
2. Không có active presence: tạo presence `parked`, dùng `camera.site_id`, zone/level đã resolve, camera gửi và confidence; gắn registered vehicle nếu tìm thấy biển số trong tenant. Ghi một `vehicle_location_events.event_type="parked"`.
3. Có presence và **cùng `zone_id`**, kể cả cả hai đều null: đặt lại status `parked`, cập nhật camera/confidence/last seen, bổ sung level nếu đang null. Trả kết quả **`seen`**, không tạo event row lịch sử mới.
4. Có presence và **khác `zone_id`**: thay zone/level, status, camera/confidence/last seen; ghi event **`relocated`** với from/to zone.

Vì vậy `vehicle_seen` đầu tiên có thể tạo `parked`; `vehicle_parked` ở cùng zone có thể chỉ tạo WS `seen`. Phát hiện cũng có thể phục hồi presence `stale` thành `parked`.

**Zone chưa biết không giữ nguyên zone cũ:** zone đã biết → không resolve được zone sẽ được tính là relocated sang null; null → zone đã biết cũng là relocated. Presence không resolve được vẫn được ghi nhận là xe đang trong bãi, `zoneId=null`, không tự chọn zone đầu tiên.

Service hiện không cập nhật `presence.site_id` của active presence khi một camera site khác cùng tenant báo lại biển số. Không xem luồng này là bộ chuyển presence giữa các site hoàn chỉnh. Unique index giới hạn một row `parked` trên tenant/biển số và code có savepoint xử lý race insert, nhưng không phải dedup từng MQTT message.

## 4. Thứ tự resolve zone chính xác

Áp dụng cho **`vehicle_parked`/`vehicle_seen`**, theo thứ tự:

1. **`zoneId`** parse được UUID và tìm được `ParkingZone.id` thuộc tenant → dùng ngay. Nhánh này không bắt buộc zone thuộc site camera hoặc nằm trong coverage.
2. Nếu chưa tìm được và `zoneCode` truthy:
   - Tìm code khớp trong các zone coverage của camera trước.
   - Nếu không có, tìm một zone cùng tenant và **`camera.site_id`** có code đó, kể cả zone ngoài coverage. Query dùng `limit(1)`, không có thứ tự ưu tiên bổ sung nếu code trùng.
3. Nếu vẫn chưa tìm được và camera có **đúng một** covered zone → dùng zone đó, kể cả payload không gửi zone hoặc gửi ID/code không resolve được.
4. Nếu không thỏa → zone **null**; log unresolved zone nhưng vẫn xử lý presence.

`zoneId` sai định dạng được đổi thành null. UUID không tồn tại/thuộc tenant khác không làm message bị từ chối ngay mà tiếp tục fallback. `zoneCode` so sánh chính xác, không trim/uppercase trong resolver; không có lọc zone status hoặc tính zone từ bounding box/polygon ở bước này.

Coverage lấy từ `camera_zone_coverages`. Cấu hình bằng route **`PUT /api/v1/tenants/{tenantId}/cameras/{cameraId}/coverage`**, body ví dụ:

```json
{
  "zoneIds": [
    "40000000-0000-0000-0000-000000000003",
    "40000000-0000-0000-0000-000000000004"
  ]
}
```

Route thay toàn bộ coverage, kiểm tra camera tenant, mọi zone được gửi tồn tại trong tenant và cùng site camera. Nó không có điều kiện bắt buộc purpose monitor trong implementation hiện tại. Publisher nhiều-zone phải gửi zone đã xác định bằng logic của mình; backend không suy ra zone từ ảnh, tên camera hoặc một cấu hình zone mặc định trong Python ANPR.

## 5. `vehicle_left`: điều kiện đóng presence

Payload tối thiểu nên dùng:

```json
{
  "type": "vehicle_left",
  "plateNumber": "51F-123.45"
}
```

Có thể gửi thêm zone UUID để ghi nguồn rời vùng:

```json
{
  "type": "vehicle_left",
  "plateNumber": "51F-123.45",
  "zoneId": "40000000-0000-0000-0000-000000000003"
}
```

Sau kiểm tra camera/tenant ở mục 1, service tìm active presence theo **tenant + biển số chuẩn hóa**, chọn row parked/stale có last seen mới nhất:

- Không có active presence → không ghi event và không phát WS.
- Có → đặt `status="exited"`, `exited_at` bằng UTC hiện tại; ghi lịch sử `exited`, `to_zone_id=null`, camera trong lịch sử là camera gửi message, confidence null, payload lịch sử `{}`.
- **Không đòi presence đang ở zone/site/camera của publisher.** `zoneId` không phải điều kiện lọc hoặc xác nhận zone hiện tại. Không nên gửi `vehicle_left` chỉ vì tracker mất xe khỏi một vùng ảnh nếu xe có thể vẫn ở bãi/đã chuyển sang camera khác.
- `from_zone_id` trong lịch sử dùng UUID payload nếu parse được, nếu thiếu/sai định dạng dùng zone hiện tại của presence. Nhánh này không gọi `resolve_zone()`, không xác minh tenant/site của zone được cung cấp; UUID không có bản ghi tương ứng có thể gây lỗi khóa ngoại ở DB. `zoneCode` bị bỏ qua.
- Không xóa `presence.zone_id`/`level_id`, không cập nhật `last_seen_at`, confidence hoặc camera của presence. Chúng vẫn phản ánh lần thấy cuối; WS exited có thể còn zone/level cũ, `lastSeenAt` không phải giờ exit.
- `occurredAt` trong payload không được truyền vào hàm exit. Lịch sử exited không giữ toàn bộ payload đầu vào.

Ngoài MQTT, `record_access_event()` cũng gọi đóng presence nếu `direction == exit` và `plate_number` truthy. Hook hiện **không thêm điều kiện decision phải allow**; không mô tả nó như xác nhận xe đã thực sự đi qua barrier. Các job sweep stale/expired là luồng riêng, không phải timeout do handler detection tự chạy.

## 6. `zone_snapshot`: upload trước, thông báo key sau

### Presign REST

```text
POST /api/v1/edge/tenants/{tenantId}/uploads/presign
X-Api-Key: credential của edge/integration
Content-Type: application/json
```

Đường dẫn trên dùng prefix API mặc định `/api/v1`. Body:

```json
{
  "kind": "zone-snapshot",
  "contentType": "image/jpeg"
}
```

`edge_ctx` thực sự xác thực key còn hiệu lực, yêu cầu scope **`edge:ingest`**, và nếu credential có tenant thì phải khớp tenant path. Credential platform có `tenant_id=null` được phép dùng tenant path khác. Không dùng camera key localhost của Python worker thay cho API credential này.

`PresignIn` có các trường:

- `kind`: mặc định **`plate`**, nên phải ghi rõ **`zone-snapshot`** cho luồng này. Route edge chấp nhận `zone-snapshot`, `parking-map`, `plate`, `overview`; giá trị khác trả bad request.
- `contentType`: mặc định **`image/jpeg`**. Schema nhận chuỗi, không tự kiểm tra bytes ảnh, kích thước hoặc danh sách MIME riêng trong route.
- `eventHint`: tùy chọn, mặc định null; route này không dùng nó để tạo key hoặc gắn camera/event.

Response thành công gồm đúng các field **`uploadUrl`**, **`objectKey`**, **`expiresIn`**; đây không phải response có `data` wrapper. Key được tạo dạng **`<tenant UUID>/<kind>/<UUID ngẫu nhiên>`**, không tự thêm đuôi `.jpg`, site hoặc camera. `expiresIn` lấy từ `S3_PRESIGN_TTL_SECONDS`, mặc định **900 giây**.

### PUT ảnh và publish MQTT

1. Gọi presign bằng key có scope đúng.
2. `PUT` bytes JPEG tới nguyên `uploadUrl`, dùng `Content-Type` khớp loại đã ký; không gửi JSON/multipart tới URL này. URL phải truy cập được từ máy publisher và chưa hết hạn.
3. Chỉ sau khi upload thành công mới publish:

```json
{
  "type": "zone_snapshot",
  "snapshotKey": "10000000-0000-0000-0000-000000000001/zone-snapshot/50000000-0000-0000-0000-000000000001",
  "occurredAt": "2026-09-29T08:30:00+07:00"
}
```

Thay `snapshotKey` ví dụ bằng **đúng `objectKey` response**. Không gửi presigned URL trong trường này, không nhúng base64 ảnh vào MQTT.

Nếu key truthy, handler ép string, cập nhật `camera.last_snapshot_key` và `snapshot_captured_at`, flush/commit, rồi phát WS `camera_snapshot`. Handler không tự kiểm tra object đã upload, key thuộc tenant/camera hay nội dung là ảnh; đó không phải bằng chứng tầng presign không có xác thực. Producer phải dùng key được cấp đúng luồng.

Nếu thiếu/null/chuỗi rỗng `snapshotKey`, handler hiện **không sửa DB nhưng vẫn phát `camera_snapshot` với giá trị key đó**, thay vì từ chối message. Publisher nên luôn gửi key hợp lệ; bên nhận UI không nên hiểu mọi frame camera_snapshot là chứng nhận đã lưu ảnh mới.

## 7. Backend → WebSocket frontend

Endpoint **`/ws/tenants/{tenantId}/barrier-telemetry`**, ngoài prefix `/api/v1`, dùng chung stream với barrier telemetry. Redis channel nội bộ là `ws:tenant:<tenantId>`, không phải MQTT topic detection.

WS có xác thực access JWT qua cookie hoặc `?token=`: từ chối token thiếu/sai, MFA pending, session không hợp lệ; tenant user phải đúng tenant, platform admin được phép, actor khác bị từ chối. Key MQTT hoặc `X-Api-Key` không thay thế JWT ở endpoint này.

### Frame vị trí xe

Ví dụ sau detection tạo presence mới:

```json
{
  "type": "vehicle_location",
  "eventType": "parked",
  "siteId": "20000000-0000-0000-0000-000000000290",
  "cameraId": "30000000-0000-0000-0000-000000000290",
  "presence": {
    "id": "70000000-0000-0000-0000-000000000001",
    "plateNumber": "51F-123.45",
    "status": "parked",
    "zoneId": "40000000-0000-0000-0000-000000000003",
    "levelId": "60000000-0000-0000-0000-000000000002",
    "zoneCode": "S03",
    "zoneName": "Khu S03",
    "lastSeenAt": "2026-09-29T01:30:00+00:00"
  }
}
```

`eventType` thực tế là một giá trị **`parked`**, **`seen`**, **`relocated`** hoặc **`exited`** theo nhánh xử lý, không phải chuỗi ghép các lựa chọn. Cùng-zone `seen` vẫn phát WS dù không tạo event row lịch sử mới.

Nếu không resolve được zone:

```json
{
  "type": "vehicle_location",
  "eventType": "parked",
  "siteId": "20000000-0000-0000-0000-000000000290",
  "cameraId": "30000000-0000-0000-0000-000000000290",
  "presence": {
    "id": "70000000-0000-0000-0000-000000000002",
    "plateNumber": "30A-999.99",
    "status": "parked",
    "zoneId": null,
    "levelId": null,
    "zoneCode": null,
    "zoneName": null,
    "lastSeenAt": "2026-09-29T01:30:00+00:00"
  }
}
```

WS không gửi confidence, normalized plate, from/to zone, `exitedAt` hoặc occurredAt riêng trong presence frame. Với exit, `cameraId` ngoài cùng là camera gửi message, còn zone/lastSeenAt trong presence là thông tin giữ lại như mục 5. `siteId` ngoài cùng lấy nguyên topic, không nhất thiết bằng site DB nếu publisher cấu hình sai.

### Frame snapshot

```json
{
  "type": "camera_snapshot",
  "siteId": "20000000-0000-0000-0000-000000000290",
  "cameraId": "30000000-0000-0000-0000-000000000290",
  "snapshotKey": "10000000-0000-0000-0000-000000000001/zone-snapshot/50000000-0000-0000-0000-000000000001"
}
```

Đây là key, không phải URL tải. Route đọc camera tạo `lastSnapshotUrl` bằng presign download khi camera có `last_snapshot_key`. WS còn có heartbeat `{"type":"ping"}` khoảng 30 giây; ping không phải ACK detection.

## 8. QoS, replay và giới hạn delivery

Publisher nên publish **QoS 1**, **`retain=false`** cho detection tức thời. `retain=false` là hướng dẫn vận hành, không phải validation của bridge: `dispatch()` chỉ nhận topic/bytes payload, không kiểm tra cờ retain.

- Subscription QoS 1 không nâng một message publisher gửi QoS 0 thành delivery QoS 1. QoS 1 cũng có thể giao trùng; PUBACK của MQTT không xác nhận transaction nghiệp vụ/WS đã hoàn tất.
- Không có `eventId`, idempotency key hoặc dedup từng message ở handler detection. Thêm `eventId` vào JSON cũng không làm backend tự dùng nó.
- Message trùng cùng zone thường thành `seen` nhưng vẫn cập nhật timestamp/confidence và phát WS; duplicate exit khi không còn active presence thì không phát gì. Dữ liệu cũ đến muộn, retained message hoặc replay sau exit có thể tạo presence parked mới, ghi lùi last seen hoặc relocate ngược.
- Bridge xử lý message tuần tự trong consumer, nhưng không có cơ chế sắp xếp theo `occurredAt` giữa các publisher/reconnect hoặc lọc stale message. Không có đảm bảo exactly-once hay toàn thứ tự nghiệp vụ.
- Exception handler/DB được `dispatch()` log; không có application ACK/NACK topic, dead-letter queue hoặc retry bền vững detection trong luồng này. Không được mặc định broker sẽ phát lại chỉ vì DB rollback/handler log lỗi.
- Bridge có vòng reconnect khi mất MQTT, đợi **5 giây**, subscribe lại. Không thấy cấu hình client ID/session bền vững trong lời gọi `aiomqtt.Client` hiện tại để cam kết giữ backlog khi bridge offline. Cần kiểm tra cấu hình broker/client thực trước khi hứa offline delivery.
- DB commit trước fan-out WS. `publish_ws()` best-effort: lỗi Redis chỉ log warning, không rollback DB; Redis pub/sub và WS không có replay/ACK per-message. Client mất kết nối phải tải lại state qua REST, không dựa vào nhận đủ mọi WS frame.
- Redis `mqtt:outbox` của bridge dành cho publish outbound khác; không phải durable inbox cho detection từ camera.

Python ANPR có HTTP retry/SQLite queue riêng, **không phải** MQTT retry của hợp đồng này. Bộ publisher monitor bên ngoài phải tự quản lý kết nối, retry, thứ tự và semantics zone/left; không chuyển máy móc `TrackLifecycleEvent.EXIT` thành kết luận xe đã rời bãi.

## 9. Checklist tích hợp và nguồn kiểm chứng

Trước khi triển khai:

1. Dùng camera thật đúng tenant/site, cấu hình purpose monitor và coverage theo bãi; kiểm tra EMQX authn/authz thực sự áp hook/policy mong muốn.
2. Publish parked vào zone S03, thấy lại cùng zone, rồi zone S04; xác nhận lần lượt WS `parked → seen → relocated`, chỉ parked/relocated tạo location event row.
3. Với camera nhiều-zone, bỏ zone và kiểm tra `zoneId=null`; với camera đúng một coverage, xác nhận backend fallback về zone đó. Không giả định Python ANPR cấp zone.
4. Thử left với biển số không có active presence: không có WS. Với biển có active presence: xác nhận exited và lastSeenAt/zone cũ được giữ; hiểu rằng zone payload không lọc presence.
5. Xin presign bằng credential đúng scope, PUT JPEG, publish key rồi đọc camera để lấy download URL; kiểm tra lỗi quyền và URL hết hạn riêng.
6. Kiểm tra message trùng/cũ, DB/Redis/broker mất kết nối; không dùng PUBACK/WS ping như xác nhận nghiệp vụ đã lưu.

Source đã đối chiếu:

- [mqtt_bridge.py](../backend/app/realtime/mqtt_bridge.py): topic/subscription, `handle_detection`, `_presence_frame`, dispatch, fan-out và reconnect.
- [parking_service.py](../backend/app/services/parking_service.py): resolve zone, upsert parked/seen/relocated, điều kiện exit và stale sweep.
- [edge.py](../backend/app/api/v1/edge.py), [credential_service.py](../backend/app/services/credential_service.py): MQTT hook, quyền presign và kiểm tra API key.
- [storage.py](../backend/app/services/storage.py), [resources.py](../backend/app/schemas/resources.py), [config.py](../backend/app/config.py): fields presign, object key và TTL.
- [cameras.py](../backend/app/api/v1/tenant/cameras.py), [models.py](../backend/app/models.py): validation REST coverage, quan hệ camera và kiểu dữ liệu presence/event.
- [ws.py](../backend/app/api/v1/ws.py), [database.py](../backend/app/database.py): WS auth/fan-out và transaction session.
- [event_service.py](../backend/app/services/event_service.py): normalize plate và hook đóng presence khi access event exit.
- [test_parking.py](../backend/tests/test_parking.py), [test_edge_activation.py](../backend/tests/test_edge_activation.py): tests service/bridge và MQTT hook hiện có. Tests dùng camera monitor không phải bằng chứng handler từ chối camera purpose khác.

Nếu chạy integration tests `python -m pytest tests/test_parking.py tests/test_edge_activation.py -q` từ `backend/`, cần dependencies và Postgres/Redis phù hợp. Fixture trong `tests/conftest.py` **drop/recreate schema của database tên kết thúc `_test`**; chỉ chạy trên DB test riêng. Việc đối chiếu source/kiểm tra JSON tài liệu không thay thế kiểm thử broker, upload object storage và WS end-to-end.
