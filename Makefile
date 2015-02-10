all:
	@cp lib/markextend.js markextend.js
	@uglifyjs --comments '/\*[^\0]+?Copyright[^\0]+?\*/' -o markextend.min.js lib/markextend.js

clean:
	@rm markextend.js
	@rm markextend.min.js

bench:
	@node test --bench

.PHONY: clean all
