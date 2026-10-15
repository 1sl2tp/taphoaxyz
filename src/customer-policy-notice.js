/* UI-POLICY-20261016: shared static policy; no RPC, no tracking, no consent database. */
(function () {
  'use strict';
  var VERSION = '20261016-v1';
  var isQuote = /^\/bao-gia\/?$/.test(window.location.pathname);
  var scope = isQuote ? 'quote' : 'sales';
  var seenKey = 'taphoa.notice.customer-policy.' + scope + '.' + VERSION;
  var markup = "<div class=\"tp-policy-dialog\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"tp-policy-title\" aria-describedby=\"tp-policy-summary\" tabindex=\"-1\">\n  <header class=\"tp-policy-header\">\n    <div class=\"tp-policy-header-top\"><span class=\"tp-policy-brand\"><span class=\"tp-policy-brand-mark\" aria-hidden=\"true\"><svg class=\"tp-policy-icon tp-policy-icon--check\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M5 12l4 4L19 6\"/></svg></span> TẠP HÓA · THÔNG BÁO CHUNG</span><button class=\"tp-policy-close\" type=\"button\" aria-label=\"Đóng thông báo\" title=\"Đóng thông báo\"><svg class=\"tp-policy-icon tp-policy-icon--close\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M6 6l12 12M18 6L6 18\"/></svg></button></div>\n    <div class=\"tp-policy-label\">Chính sách mua hàng & hỗ trợ thanh toán</div>\n    <h2 id=\"tp-policy-title\">Rõ ràng từ đầu, hợp tác lâu dài</h2>\n    <p id=\"tp-policy-summary\">Hai hình thức thanh toán, tự nguyện lựa chọn theo nhu cầu và khả năng tài&nbsp;chính.</p>\n    <div class=\"tp-policy-tags\"><span>Minh bạch</span><span>Tự nguyện</span><span>Giữ đúng cam kết</span></div>\n  </header>\n  <div class=\"tp-policy-content\" tabindex=\"0\" aria-label=\"Nội dung chính sách, cuộn xuống để đọc đầy đủ\">\n    <p class=\"tp-policy-greeting\">Kính gửi anh/chị,</p>\n    <p>Nhằm giúp các cửa hàng chủ động nhập hàng, quay vòng vốn thuận lợi và xây dựng mối quan hệ hợp tác chuyên nghiệp, lâu dài, bên em áp dụng hai hình thức thanh toán để anh/chị tự nguyện lựa chọn theo nhu cầu và khả năng tài chính.</p>\n    <section class=\"tp-policy-section\">\n      <h3><span class=\"tp-policy-num\">01</span> Thanh toán ngay</h3>\n      <ul>\n        <li><strong>Chuyển khoản:</strong> Thanh toán đúng số tiền đơn hàng.</li>\n        <li><strong>Tiền mặt:</strong> Ưu tiên số tiền chẵn đã thống nhất trước khi giao để thuận tiện kiểm đếm. Mọi khoản chênh lệch đều được ghi nhận, đối chiếu rõ ràng.</li>\n      </ul>\n    </section>\n    <section class=\"tp-policy-section\">\n      <h3><span class=\"tp-policy-num\">02</span> Thanh toán theo hạn mức</h3>\n      <p>Bên em có thể xem xét hỗ trợ hạn mức <strong>50–100 triệu đồng</strong>, tùy theo điều kiện và mức được duyệt riêng cho từng cửa hàng, giúp anh/chị chủ động nguồn hàng và vốn kinh doanh.</p>\n      <p>Cửa hàng được nhập hàng nhiều lần trong chu kỳ. Thời điểm phải tất toán được xác định theo <strong>điều kiện nào đến trước</strong> trong ba trường hợp:</p>\n      <ul>\n        <li><strong>Đạt hạn mức:</strong> Tất toán ngay khi công nợ đạt mức được hỗ trợ.</li>\n        <li><strong>Ngừng nhập hàng 3 ngày liên tiếp:</strong> Dừng hỗ trợ và tất toán ngay ngày thứ 3 không nhập hàng. Ví dụ: nhập ngày 1, không nhập ngày 2, 3, 4 thì ngày 4 phải tất toán.</li>\n        <li><strong>Đến ngày thứ 7:</strong> Tất toán toàn bộ công nợ dù vẫn nhập hàng. Ngày bắt đầu chu kỳ tính là ngày 1; việc nhập thêm không kéo dài thời hạn.</li>\n      </ul>\n    </section>\n    <section class=\"tp-policy-section\">\n      <h3><span class=\"tp-policy-num\">03</span> Sự thống nhất trong gia đình</h3>\n      <p>Trước khi sử dụng hạn mức, người trực tiếp mua hàng cần trao đổi và có sự đồng ý, xác nhận của vợ/chồng hoặc người thân trưởng thành phù hợp như bố mẹ, con cái. Nếu vợ chồng cùng kinh doanh, cả hai cần biết và thống nhất.</p>\n      <p>Mục đích không phải yêu cầu người thân trả nợ thay, mà để gia đình cùng biết rõ việc nhập hàng, hạn mức và thời điểm thanh toán.</p>\n      <p>Thực tế có những trường hợp một người nhập hàng mà người còn lại không biết, hoặc tiền kinh doanh được sử dụng vào việc riêng, chơi họ/hụi, lô đề, cờ bạc… dẫn đến thiếu tiền thanh toán, phát sinh tranh cãi và ảnh hưởng đến cuộc sống gia đình.</p>\n      <p><strong>Đây là điều không ai mong muốn.</strong> Bên em hỗ trợ vốn để phục vụ kinh doanh, không muốn việc mua bán vô tình trở thành nguyên nhân gây bất đồng giữa người thân hoặc khiến các bên khó xử.</p>\n      <p>Vì vậy, nếu gia đình chưa thống nhất, anh/chị vui lòng lựa chọn thanh toán ngay thay vì sử dụng hạn mức.</p>\n    </section>\n    <section class=\"tp-policy-section\">\n      <h3><span class=\"tp-policy-num\">04</span> Cam kết và uy tín thanh toán</h3>\n      <p>Khi lựa chọn mua hàng theo hạn mức, anh/chị cần chủ động cân đối tài chính và cam kết <strong>tất toán đủ 100% toàn bộ công nợ trong một lần</strong> theo thời điểm quy định tại mục 2.</p>\n      <p><strong>Không áp dụng trả từng phần, trả đuổi hoặc chuyển nợ sang chu kỳ tiếp theo.</strong></p>\n      <p>Khi đến hạn, anh/chị vui lòng chuyển khoản đủ hoặc chuẩn bị sẵn tiền mặt để bên em kết hợp thu khi giao hàng, tránh mất thời gian đi lại của hai bên.</p>\n      <div class=\"tp-policy-emphasis\">Uy tín trong kinh doanh không chỉ thể hiện ở việc thanh toán đủ, mà còn ở việc giữ đúng thời gian đã cam kết.</div>\n      <p>Trường hợp không thanh toán đúng hẹn, bên em sẽ tạm dừng hỗ trợ công nợ và <strong>xem xét lại mức độ tín nhiệm, điều kiện giao dịch cũng như khả năng tiếp tục hợp tác.</strong></p>\n      <p>Việc thanh toán hết công nợ sau khi quá hạn không đồng nghĩa với việc tự động được cấp lại hạn mức.</p>\n      <p>Nếu chưa chắc chắn có thể thanh toán đầy đủ và đúng hẹn, anh/chị vui lòng chưa lựa chọn hình thức mua hàng theo hạn mức.</p>\n    </section>\n    <section class=\"tp-policy-section tp-policy-section-final\">\n      <h3><span class=\"tp-policy-num\">05</span> Tinh thần hợp tác</h3>\n      <p>Chính sách này được xây dựng trên tinh thần <strong>tự nguyện, minh bạch, tôn trọng và có trách nhiệm từ cả hai phía.</strong></p>\n      <p>Bên em mong muốn việc hỗ trợ vốn mang lại lợi ích thiết thực cho hoạt động kinh doanh của cửa hàng, đồng thời giúp hai bên chủ động, yên tâm trong giao nhận và thanh toán.</p>\n      <p><strong>Sự tin tưởng và việc giữ đúng cam kết là nền tảng để duy trì, phát triển mối quan hệ hợp tác bền vững, lâu dài.</strong></p>\n      <p>Em chân thành cảm ơn anh/chị!</p>\n    </section>\n  </div>\n  <footer class=\"tp-policy-footer\"><span class=\"tp-policy-footer-hint\">Có thể xem lại chính sách bất cứ lúc nào.</span><button class=\"tp-policy-continue\" type=\"button\">Đã đọc · Tiếp tục <svg class=\"tp-policy-icon tp-policy-icon--arrow\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M4 12h16m-7-7 7 7-7 7\"/></svg></button></footer>\n</div>";
  function getSeen() {
    try { return window.sessionStorage.getItem(seenKey) === '1'; } catch (_) { return false; }
  }
  function setSeen() {
    try { window.sessionStorage.setItem(seenKey, '1'); } catch (_) { /* private storage disabled */ }
  }
  function mount() {
    if (!document.body || document.getElementById('tp-policy-overlay')) return;
    var backdrop = document.createElement('div');
    backdrop.id = 'tp-policy-overlay';
    backdrop.className = 'tp-policy-overlay';
    backdrop.hidden = true;
    backdrop.innerHTML = markup;
    document.body.appendChild(backdrop);
    var dialog = backdrop.querySelector('.tp-policy-dialog');
    var scrollArea = backdrop.querySelector('.tp-policy-content');
    var closeButton = backdrop.querySelector('.tp-policy-close');
    var continueButton = backdrop.querySelector('.tp-policy-continue');
    var reopen = document.createElement('button');
    reopen.type = 'button';
    reopen.className = 'tp-policy-reopen tp-policy-reopen--' + (isQuote ? 'quote' : 'home');
    reopen.innerHTML = "<svg class=\"tp-policy-icon tp-policy-icon--info\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v6\"/><path d=\"M12 7h.01\"/></svg><span>Chính sách thanh toán</span>";
    reopen.setAttribute('aria-label', 'Xem lại chính sách mua hàng và thanh toán');
    if (isQuote) {
      var host = document.querySelector('.hero .summary') || document.querySelector('.hero');
      if (host) host.appendChild(reopen);
      else document.body.appendChild(reopen);
    } else {
      document.body.appendChild(reopen);
    }
    var lastFocus = null;
    var formerOverflow = null;
    function openNotice() {
      if (!backdrop.hidden) return;
      lastFocus = document.activeElement;
      formerOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      backdrop.hidden = false;
      scrollArea.scrollTop = 0;
      dialog.focus({preventScroll:true});
    }
    function closeNotice() {
      if (backdrop.hidden) return;
      backdrop.hidden = true;
      document.documentElement.style.overflow = formerOverflow || '';
      setSeen();
      if (lastFocus && lastFocus !== document.body && document.contains(lastFocus) && typeof lastFocus.focus === 'function') lastFocus.focus({preventScroll:true});
      else reopen.focus({preventScroll:true});
    }
    closeButton.addEventListener('click', closeNotice);
    continueButton.addEventListener('click', closeNotice);
    reopen.addEventListener('click', openNotice);
    backdrop.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeNotice();
      }
      if (event.key !== 'Tab') return;
      var focusables = [closeButton, scrollArea, continueButton];
      var current = focusables.indexOf(document.activeElement);
      if (event.shiftKey && current === 0) {
        event.preventDefault();
        continueButton.focus();
      } else if (!event.shiftKey && current === focusables.length - 1) {
        event.preventDefault();
        closeButton.focus();
      }
    });
    if (!getSeen()) openNotice();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
}());
