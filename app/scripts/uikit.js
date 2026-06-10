class View {
    constructor (...blocks) {
        this.blocks = blocks;
        this.styles = {}
        this.classList = []
        this.id = "";
        this.attributes = {}
    }
    classes () {
        return {
            add: (c) => {
                this.classList.push(c)
                return this
            },
            remove: (c) => {
                this.classList = this.classList.filter(data => data != c);
                return this
            }
        }
    }
    render () {
        let b = document.createElement("div");
        this.classList.forEach(e=>{
            b.classList.add(e)
        })
        if (this.clickEvent) {
            b.addEventListener("click", this.clickCallback)
        }
        return b

    }
    onclick (callback) {
        this.clickEvent = true;
        this.clickCallback = callback;
        return this;
    }
}